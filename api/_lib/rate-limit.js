const buckets = new Map();

function clientKey(req) {
  const forwarded = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.socket?.remoteAddress || 'unknown';
}

function enforceRateLimit(req, res, { name, limit = 60, windowMs = 60_000 }) {
  const now = Date.now();
  const key = `${name}:${clientKey(req)}`;
  const current = buckets.get(key);
  const bucket = !current || current.resetAt <= now
    ? { count: 0, resetAt: now + windowMs }
    : current;
  bucket.count += 1;
  buckets.set(key, bucket);

  const remaining = Math.max(0, limit - bucket.count);
  res.setHeader?.('RateLimit-Limit', String(limit));
  res.setHeader?.('RateLimit-Remaining', String(remaining));
  res.setHeader?.('RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));
  if (bucket.count <= limit) return true;

  res.setHeader?.('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
  res.status(429).json({
    error: 'Çok fazla istek gönderildi. Kısa bir süre sonra tekrar deneyin.',
    code: 'RATE_LIMITED',
    retryable: true,
  });
  return false;
}

module.exports = { enforceRateLimit };
