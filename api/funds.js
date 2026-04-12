const supabase = require('./_lib/supabase');
const { TTL, createCacheKey, getOrSetCache } = require('./_lib/cache');
const { ensureSupabase } = require('./_lib/supabase-guard');

const PAGE_SIZE = 1000;

async function fetchFundRows({ fon_tipi, tefasOnly = false }) {
  const rows = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    let query = supabase
      .from('fund_profiles')
      .select('fon_kodu, unvan, fon_tipi, risk_seviyesi, portfoy_yonetim_sirketi, tefasa_acik, guncelleme_zamani')
      .eq('fon_tipi', fon_tipi);

    if (tefasOnly) {
      query = query.eq('tefasa_acik', true);
    }

    const { data, error } = await query
      .order('fon_kodu')
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;

    const page = data || [];
    rows.push(...page);

    if (page.length < PAGE_SIZE) {
      break;
    }
  }

  return rows;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=3600');
  if (!ensureSupabase(res)) return;

  try {
    const kind = (req.query.kind || 'YAT').toString().toUpperCase();

    // Map legacy kind codes to fon_tipi values stored in fund_profiles
    const kindMap = { YAT: 'mutual', EMK: 'pension', BYF: 'exchange' };
    const fon_tipi = kindMap[kind];
    const tefasOnly = kind === 'YAT';
    if (!fon_tipi) {
      return res.status(400).json({ error: `Invalid kind: ${kind}` });
    }

    const { value, cached } = await getOrSetCache(
      createCacheKey('funds', { kind, fon_tipi, tefasOnly }),
      TTL.FUND_MASTER,
      async () => {
        const data = await fetchFundRows({ fon_tipi, tefasOnly });

        const funds = (data || []).map((f) => ({
          code: f.fon_kodu,
          title: f.unvan,
          kind,
        }));

        const latestRefresh = (data || [])
          .map((f) => f.guncelleme_zamani)
          .filter(Boolean)
          .sort()
          .at(-1) || null;

        return { funds, latestRefresh };
      }
    );

    return res.status(200).json({
      funds: value.funds,
      meta: {
        cached,
        source: 'fund_profiles',
        refreshedAt: value.latestRefresh,
      },
    });
  } catch (err) {
    console.error('[funds] Error:', err);
    return res.status(500).json({ error: err.message });
  }
};
