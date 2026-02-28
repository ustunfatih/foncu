const localEvents = require('./_lib/market-events.json');

const parseDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  const time = date.getTime();
  return Number.isNaN(time) ? null : time;
};

const normalizeImpact = (value) => {
  if (!value) return 'medium';
  const text = String(value).toLowerCase();
  if (text.includes('high')) return 'high';
  if (text.includes('low')) return 'low';
  return 'medium';
};

// Simple in-memory cache to prevent quota exhaustion
// Vercel functions may reuse the container, preserving this cache across requests.
const cache = {
  data: null,
  timestamp: 0,
  promise: null,
};
const CACHE_TTL = 3600 * 1000; // 1 hour

const fetchTradingEconomics = async () => {
  const apiKey = process.env.TRADING_ECONOMICS_KEY;
  if (!apiKey) return null;

  const url = new URL('https://api.tradingeconomics.com/calendar');
  url.searchParams.append('c', apiKey);
  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`TradingEconomics failed: ${response.status}`);
  }
  const payload = await response.json();
  if (!Array.isArray(payload)) return null;

  return payload.map((event) => {
    const dateStr = event.Date ? String(event.Date).slice(0, 10) : '';
    return {
      date: dateStr,
      type: event.Country || event.Category || 'GLOBAL',
      title: event.Event || event.Category || 'Ekonomik Takvim',
      impact: normalizeImpact(event.Importance || event.Impact),
      note: event.Reference || event.Actual || '',
    };
  });
};

const getCachedTradingEconomics = async () => {
  const now = Date.now();

  // Return cached data if valid
  if (cache.data && (now - cache.timestamp < CACHE_TTL)) {
    return cache.data;
  }

  // Return existing promise if fetch is in progress (thundering herd protection)
  if (cache.promise) {
    return cache.promise;
  }

  // Fetch new data
  cache.promise = (async () => {
    try {
      const data = await fetchTradingEconomics();
      if (data && data.length > 0) {
        cache.data = data;
        cache.timestamp = Date.now();
      }
      return data;
    } catch (error) {
      // If fetch fails, return potentially stale data if available
      if (cache.data) {
        console.warn('[market-events] Fetch failed, using stale cache:', error.message);
        return cache.data;
      }
      throw error;
    } finally {
      cache.promise = null;
    }
  })();

  return cache.promise;
};

module.exports = async function handler(req, res) {
  try {
    // Add Cache-Control header to leverage CDN and browser caching
    // public: cacheable by anyone (CDN)
    // s-maxage=3600: CDN cache for 1 hour
    // stale-while-revalidate=86400: Serve stale content while updating in background
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');

    const type = (req.query.type || '').toString().toUpperCase();
    const start = parseDate(req.query.start);
    const end = parseDate(req.query.end);

    let events = localEvents.events || [];
    try {
      const external = await getCachedTradingEconomics();
      if (external && external.length > 0) {
        events = external;
      }
    } catch (error) {
      console.warn('[market-events] external source failed', error.message);
    }

    const filtered = events.filter((event) => {
      if (!type) return true;
      return event.type.toUpperCase() === type;
    }).filter((event) => {
      if (!start && !end) return true;
      const time = parseDate(event.date);
      if (!time) return false;
      if (start && time < start) return false;
      if (end && time > end) return false;
      return true;
    });

    return res.status(200).json({
      count: filtered.length,
      events: filtered,
    });
  } catch (error) {
    console.error('[market-events] failed', error);
    return res.status(500).json({ error: 'Failed to load events' });
  }
};
