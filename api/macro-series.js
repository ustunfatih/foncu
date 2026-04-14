const SYMBOL_MAP = {
  USDTRY: { type: 'forex', source: 'frankfurter', config: { base: 'USD', symbols: 'TRY' } },
  EURTRY: { type: 'forex', source: 'frankfurter', config: { base: 'EUR', symbols: 'TRY' } },
  GBPTRY: { type: 'forex', source: 'frankfurter', config: { base: 'GBP', symbols: 'TRY' } },
  GOLD: { type: 'commodity', source: 'gold' },
  BRENT: { type: 'commodity', source: 'brent' },
};

const buildRange = (days) => {
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  return {
    startStr: start.toISOString().split('T')[0],
    endStr: end.toISOString().split('T')[0],
  };
};

const FETCH_TIMEOUT_MS = 15000;

const fetchFromFrankfurter = async (config, startStr, endStr) => {
  const url = new URL(`https://api.frankfurter.app/${startStr}..${endStr}`);
  url.searchParams.append('from', config.base);
  url.searchParams.append('to', config.symbols);

  const response = await fetch(url.toString(), { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) {
    throw new Error(`Frankfurter source failed: ${response.status}`);
  }
  const payload = await response.json();
  const rates = payload?.rates || {};
  return Object.keys(rates)
    .sort()
    .map((date) => ({
      date,
      value: Number(rates[date][config.symbols]) || 0,
    }))
    .filter((point) => point.value > 0);
};

const fetchGoldPrice = async () => {
  try {
    const response = await fetch('https://api.metalpriceapi.com/v1/latest?api_key=demo&currency=TRY&unit=toz&currency=TRY&unit=oz', { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!response.ok) return null;
    const data = await response.json();
    if (data.rates?.XAU) {
      const today = new Date().toISOString().split('T')[0];
      return [{ date: today, value: data.rates.XAU }];
    }
    return null;
  } catch (e) {
    console.error('Gold API error:', e);
    return null;
  }
};

const fetchBrentPrice = async () => {
  try {
    const response = await fetch('https://api.twelvedata.com/time_series?symbol=BCO/USD&interval=1day&apikey=demo&outputsize=1', { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!response.ok) return null;
    const data = await response.json();
    if (data.values && data.values.length > 0) {
      return [{
        date: data.values[0].datetime,
        value: parseFloat(data.values[0].close)
      }];
    }
    return null;
  } catch (e) {
    console.error('Brent API error:', e);
    return null;
  }
};

module.exports = async function handler(req, res) {
  try {
    const symbol = (req.query.symbol || 'USDTRY').toString().toUpperCase();
    const days = Math.min(Number(req.query.days) || 365, 365 * 2);
    const { startStr, endStr } = buildRange(days);
    
    const config = SYMBOL_MAP[symbol];
    if (!config) {
      return res.status(400).json({ 
        error: 'Unsupported symbol',
        supported: Object.keys(SYMBOL_MAP)
      });
    }

    let series = [];
    let source = '';

    if (config.source === 'frankfurter') {
      series = await fetchFromFrankfurter(config.config, startStr, endStr);
      source = 'frankfurter.app';
    } else if (config.source === 'gold') {
      const goldData = await fetchGoldPrice();
      series = goldData || [];
      source = 'metalpriceapi.com';
    } else if (config.source === 'brent') {
      const brentData = await fetchBrentPrice();
      series = brentData || [];
      source = 'twelvedata.com';
    }

    return res.status(200).json({
      symbol,
      range: { start: startStr, end: endStr },
      series,
      source,
    });
  } catch (error) {
    console.error('[macro-series] failed', error);
    return res.status(500).json({ error: 'Failed to load macro series' });
  }
};