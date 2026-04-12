# Content Security Policy (CSP) Ownership and Change Policy

## Owner

- **Primary owner:** Application Security maintainers (repo maintainers who approve `vercel.json` header changes).
- **Secondary owners:** Frontend maintainers for implementation details that require CSP updates.

All CSP changes must be reviewed by at least one maintainer responsible for security-sensitive config changes.

## Baseline Policy (Current)

The canonical CSP is set in `vercel.json` under `headers[].headers[]`:

```text
default-src 'self';
script-src 'self';
style-src 'self' https://fonts.googleapis.com;
font-src 'self' https://fonts.gstatic.com;
img-src 'self' blob: data:;
connect-src 'self' https://*.supabase.co wss://*.supabase.co;
```

### Rationale by directive

- `default-src 'self'`: deny-by-default baseline for all resource types.
- `script-src 'self'`: allow first-party scripts only; blocks injected or unexpected third-party script execution.
- `style-src 'self' https://fonts.googleapis.com`: keep styles first-party while allowing hosted Google Fonts stylesheets.
- `font-src 'self' https://fonts.gstatic.com`: explicitly allow font payloads from trusted font host.
- `img-src 'self' blob: data:`: permit app-managed local blobs/data URLs used by the frontend.
- `connect-src 'self' https://*.supabase.co wss://*.supabase.co`: allow API and websocket traffic to Supabase and same-origin calls only.

## Procedure: Adding New Script/Style Sources

When product requirements introduce a new script/style dependency, use this order:

1. **Prefer nonce/hash-based allow rules first**
   - For inline scripts/styles, use nonces (`'nonce-...'`) or hashes (`'sha256-...'`) instead of broad relaxations.
   - Keep scope as small as possible (single script/style block where feasible).
2. **Domain allowlisting second**
   - If nonce/hash is not possible (e.g., trusted third-party hosted file), add the minimal exact origin to the relevant directive.
   - Add only the required protocol + host (avoid broad patterns when not strictly needed).
3. **Document why**
   - In the PR description, explain why nonce/hash could not be used and why the new domain is necessary.
   - Include evidence (vendor docs, feature requirement) and expected runtime calls.
4. **Validate with CSP check**
   - Run `node scripts/check-csp.js` locally.
   - Ensure CI passes before merge.

## Explicitly Prohibited Fallbacks

The following are not allowed:

- `unsafe-inline` in `script-src` or `style-src`.
- Wildcard script hosts in `script-src` (for example `*`, `https:`, `http:`, `*.example.com`).
- Replacing strict directives with permissive catch-alls without security review.

If a feature appears to require one of the prohibited fallbacks, treat it as a security design issue and escalate to security owners.

## CSP Regression Checklist (for PRs)

Use this checklist whenever CSP-related changes are included:

- [ ] `default-src` remains `'self'` (or stricter).
- [ ] `script-src` does not include `unsafe-inline`.
- [ ] `script-src` does not include wildcard hosts/schemes.
- [ ] New script/style allowances use nonce/hash first, domain allowlisting second.
- [ ] Added domains are minimal and justified in PR notes.
- [ ] `node scripts/check-csp.js` passes locally and in CI.
