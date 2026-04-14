const SYMBOL_MAP: Record<string, { type: string; source: string; config?: any }> = {
  USDTRY: { type: 'forex', source: 'frankfurter', config: { base: 'USD', symbols: 'TRY' } },
  EURTRY: { type: 'forex', source: 'frankfurter', config: { base: 'EUR', symbols: 'TRY' } },
  GBPTRY: { type: 'forex', source: 'frankfurter', config: { base: 'GBP', symbols: 'TRY' } },
  GOLD: { type: 'commodity', source: 'goldapi', config: { symbol: 'XAUUSD' } },
  BRENT: { type: 'commodity', source: 'oil' },
  BIST100: { type: 'index', source: 'tcmb' },
  CBOND: { type: 'rate', source: 'tcmb' },
};

const buildRange = (days: number) => {
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  return {
    startStr: start.toISOString().split('T')[0],
    endStr: end.toISOString().split('T')[0],
  };
};

const FETCH_TIMEOUT_MS = 15000;

const fetchFromFrankfurter = async (config: any, startStr: string, endStr: string) => {
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

const fetchGoldPrice = async (startStr: string, endStr: string) => {
  const url = 'https://www.goldapi.io/api/XAU/USD';
  const headers = {
    'x-access-token': process.env.GOLDAPI_KEY || '',
    'Content-Type': 'application/json',
  };
  
  try {
    const endDate = new Date();
    const startDate = new Date(startStr);
    const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const series = [];
    
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!response.ok) return [];
    
    const data = await response.json();
    if (data.price) {
      const today = new Date().toISOString().split('T')[0];
      return [{ date: today, value: data.price }];
    }
    return [];
  } catch (e) {
    console.error('Gold API error:', e);
    return [];
  }
};

const fetchBrentOil = async (startStr: string, endStr: string) => {
  const url = `https://api.eia.gov/v2/petroleum/pri/spt/data/?api_key=${process.env.EIA_KEY || ''}&frequency=daily&data[0]=value&facets[product][]=WTI&sort[0][column]=date&sort[0][direction]=desc&length=5000`;
  
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!response.ok) return [];
    
    const data = await response.json();
    const series = [];
    
    if (data.response?.data) {
      for (const item of data.response.data) {
        if (item.product === 'WTI' && item.value) {
          const dateStr = item.date?.toString();
          if (dateStr && dateStr >= startStr && dateStr <= endStr) {
            series.push({ date: dateStr, value: item.value });
          }
        }
      }
    }
    
    return series.sort((a, b) => a.date.localeCompare(b.date));
  } catch (e) {
    console.error('Oil API error:', e);
    return [];
  }
};

const fetchBIST100 = async (startStr: string, endStr: string) => {
  const url = new URL('https://api.borsaistanbul.com/bist Securities/index');
  
  try {
    const response = await fetch(url.toString(), { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!response.ok) return [];
    
    const data = await response.json();
    const latest = data.data?.[0];
    
    if (latest?.price) {
      const today = new Date().toISOString().split('T')[0];
      return [{ date: today, value: latest.price }];
    }
    return [];
  } catch (e) {
    console.error('BIST API error:', e);
    return [];
  }
};

const fetchTCMBRates = async (startStr: string, endStr: string) => {
  const url = new URL('https://www.tcmb.gov.tr/kurlar/today.xml');
  
  try {
    const response = await fetch(url.toString(), { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!response.ok) return [];
    
    const text = await response.text();
    const parser = new DOMParser();
    const xml = parser.parseFromString(text, 'text/xml');
    const currencies = xml.querySelectorAll('Currency');
    const today = new Date().toISOString().split('T')[0];
    const series = [];
    
    for (const cur of currencies) {
      const code = cur.getAttribute('Code');
      if (code === 'USD') {
        const rate = cur.querySelector('ForexSelling')?.textContent;
        if (rate) {
          series.push({ date: today, value: parseFloat(rate) });
        }
      }
    }
    
    return series;
  } catch (e) {
    console.error('TCMB error:', e);
    return [];
  }
};

export default async function handler(req, res) {
  try {
    const symbol = (req.query.symbol || 'USDTRY').toString().toUpperCase();
    const days = Math.min(Number(req.query.days) || 365, 365 * 5);
    const { startStr, endStr } = buildRange(days);
    
    const config = SYMBOL_MAP[symbol];
    if (!config) {
      return res.status(400).json({ 
        error: 'Unsupported symbol',
        supported: Object.keys(SYMBOL_MAP)
      });
    }

    let series: any[] = [];
    let source = '';

    switch (config.source) {
      case 'frankfurter':
        series = await fetchFromFrankfurter(config.config, startStr, endStr);
        source = 'frankfurter.app';
        break;
        
      case 'goldapi':
        series = await fetchGoldPrice(startStr, endStr);
        source = 'goldapi.io';
        break;
        
      case 'oil':
        series = await fetchBrentOil(startStr, endStr);
        source = 'eia.gov';
        break;
        
      case 'bist':
        series = await fetchBIST100(startStr, endStr);
        source = 'borsaistanbul.com';
        break;
        
      case 'tcmb':
        series = await fetchTCMBRates(startStr, endStr);
        source = 'tcmb.gov.tr';
        break;
        
      default:
        return res.status(400).json({ error: 'Unknown source' });
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
}