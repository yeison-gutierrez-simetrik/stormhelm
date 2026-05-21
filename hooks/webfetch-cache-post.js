#!/usr/bin/env node
// hooks/webfetch-cache-post.js
// PostToolUse hook (matcher: WebFetch). Implements rule §108.
//
// After a real WebFetch returns, attempts to retrieve HTTP validators
// (ETag, Last-Modified) via a HEAD request and stores the cache entry
// only when at least one validator is present. Without validators we
// cannot revalidate safely, so we refuse to cache (anti-staleness).
//
// Always exits 0 — this hook never blocks. Failures are silent so a
// caching issue cannot break the agent flow.
//
// No external dependencies.

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const TIMEOUT_MS = 5000;
const CACHE_DIR_NAME = '.claude/webfetch-cache';

async function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function projectDir() {
  return process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

function cachePath(url) {
  return path.join(projectDir(), CACHE_DIR_NAME, `${sha256(url)}.json`);
}

async function ensureCacheDir() {
  await fs.mkdir(path.join(projectDir(), CACHE_DIR_NAME), { recursive: true });
}

async function readConfig() {
  const cfgPath = path.join(projectDir(), '.claude/hooks.config.json');
  try {
    const raw = await fs.readFile(cfgPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function urlMatchesBypass(url, patterns) {
  if (!Array.isArray(patterns)) return false;
  return patterns.some((p) => {
    try {
      return new RegExp(p).test(url);
    } catch {
      return url.includes(p);
    }
  });
}

async function fetchValidators(url) {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { method: 'HEAD', signal: ctrl.signal });
    if (!res.ok) return null;
    const etag = res.headers.get('etag');
    const lastModified = res.headers.get('last-modified');
    if (!etag && !lastModified) return null;
    return { etag, last_modified: lastModified };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function extractBody(toolResponse) {
  if (typeof toolResponse === 'string') return toolResponse;
  if (toolResponse?.content) return toolResponse.content;
  if (toolResponse?.body) return toolResponse.body;
  if (Array.isArray(toolResponse)) {
    return toolResponse
      .map((item) => (typeof item === 'string' ? item : item?.text || ''))
      .join('');
  }
  try {
    return JSON.stringify(toolResponse);
  } catch {
    return String(toolResponse ?? '');
  }
}

async function atomicWrite(filePath, data) {
  const tmp = `${filePath}.tmp.${process.pid}`;
  await fs.writeFile(tmp, data, 'utf8');
  await fs.rename(tmp, filePath);
}

async function main() {
  let envelope;
  try {
    const raw = await readStdin();
    envelope = JSON.parse(raw || '{}');
  } catch {
    process.exit(0);
  }

  if (envelope.tool_name !== 'WebFetch') process.exit(0);

  const url = envelope.tool_input?.url;
  if (!url || typeof url !== 'string') process.exit(0);

  const config = await readConfig();
  const bypass = config.webfetch_cache?.bypass_url_patterns;
  if (urlMatchesBypass(url, bypass)) process.exit(0);

  const validators = await fetchValidators(url);
  if (!validators) process.exit(0); // no validators → refuse to cache

  const body = extractBody(envelope.tool_response);
  if (!body) process.exit(0);

  await ensureCacheDir();
  const entry = {
    url,
    etag: validators.etag,
    last_modified: validators.last_modified,
    fetched_at: new Date().toISOString(),
    body,
  };
  try {
    await atomicWrite(cachePath(url), JSON.stringify(entry, null, 2));
  } catch {
    // Cache write failure is non-fatal.
  }
  process.exit(0);
}

main().catch(() => process.exit(0));
