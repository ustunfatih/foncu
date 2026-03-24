const cacheStore = new Map();

const TTL = {
  FUND_MASTER: 15 * 60 * 1000,
  FUND_SCREEN: 5 * 60 * 1000,
  HOLDINGS_SCREEN: 10 * 60 * 1000,
  FUND_PROFILE: 30 * 60 * 1000,
};

function stableStringify(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }

  const entries = Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, nested]) => `${JSON.stringify(key)}:${stableStringify(nested)}`).join(',')}}`;
}

function createCacheKey(prefix, params = {}) {
  return `${prefix}:${stableStringify(params)}`;
}

function getCachedValue(key) {
  const entry = cacheStore.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cacheStore.delete(key);
    return null;
  }
  return entry.value;
}

function setCachedValue(key, value, ttlMs) {
  cacheStore.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
  return value;
}

async function getOrSetCache(key, ttlMs, loader) {
  const cached = getCachedValue(key);
  if (cached !== null) {
    return { value: cached, cached: true };
  }

  const value = await loader();
  setCachedValue(key, value, ttlMs);
  return { value, cached: false };
}

function clearCache() {
  cacheStore.clear();
}

function invalidateCacheByPrefix(prefix) {
  for (const key of cacheStore.keys()) {
    if (key.startsWith(prefix)) {
      cacheStore.delete(key);
    }
  }
}

module.exports = {
  TTL,
  clearCache,
  createCacheKey,
  getCachedValue,
  getOrSetCache,
  invalidateCacheByPrefix,
  setCachedValue,
};
