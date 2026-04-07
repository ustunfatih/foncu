#!/usr/bin/env node

const fs = require('fs');

function fail(message) {
  console.error(`CSP check failed: ${message}`);
  process.exit(1);
}

const vercelPath = 'vercel.json';
if (!fs.existsSync(vercelPath)) {
  fail('vercel.json not found');
}

const config = JSON.parse(fs.readFileSync(vercelPath, 'utf8'));
const headers = config.headers || [];

const cspEntry = headers
  .flatMap((group) => group.headers || [])
  .find((header) => header.key === 'Content-Security-Policy');

if (!cspEntry || !cspEntry.value) {
  fail('Content-Security-Policy header is missing in vercel.json');
}

const directives = {};
for (const chunk of cspEntry.value.split(';')) {
  const trimmed = chunk.trim();
  if (!trimmed) continue;
  const parts = trimmed.split(/\s+/);
  const directive = parts[0];
  const values = parts.slice(1);
  directives[directive] = values;
}

const scriptSrc = directives['script-src'] || [];
const styleSrc = directives['style-src'] || [];

if (!scriptSrc.length) {
  fail('script-src directive is required');
}

if (scriptSrc.includes("'unsafe-inline'")) {
  fail("script-src must not include 'unsafe-inline'");
}

if (styleSrc.includes("'unsafe-inline'")) {
  fail("style-src must not include 'unsafe-inline'");
}

const forbiddenScriptPatterns = [/^\*$/, /^https?:$/, /^\*\..+/];
for (const token of scriptSrc) {
  if (forbiddenScriptPatterns.some((pattern) => pattern.test(token))) {
    fail(`script-src contains a forbidden wildcard/scheme token: ${token}`);
  }
}

console.log('CSP check passed.');
