#!/usr/bin/env node
// hooks/webfetch-cache-pre.js
// PreToolUse hook (matcher: WebFetch). Implements rule §108.
//
// On a cache hit with HTTP validators (ETag / Last-Modified), sends a HEAD
// request with conditional headers. If the origin responds 304 Not Modified,
// the cached body is served back to the agent via exit 2 + stderr — the real
// WebFetch is never executed, saving tokens and latency.
//
// On cache miss, validator absence, server error, or 2xx response: exits 0
// silently, letting Claude Code proceed with the real WebFetch.
//
// No external dependencies: uses Node 18+ built-in fetch, crypto, fs/promises.

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

async function readCache(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
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

async function headRequest(url, validators) {
  const headers = {};
  if (validators.etag) headers['If-None-Match'] = validators.etag;
  if (validators.last_modified) headers['If-Modified-Since'] = validators.last_modified;

  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { method: 'HEAD', headers, signal: ctrl.signal });
    return { status: res.status };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  let envelope;
  try {
    const raw = await readStdin();
    envelope = JSON.parse(raw || '{}');
  } catch {
    // Malformed stdin → proceed without interference
    process.exit(0);
  }

  if (envelope.tool_name !== 'WebFetch') process.exit(0);

  const url = envelope.tool_input?.url;
  if (!url || typeof url !== 'string') process.exit(0);

  const config = await readConfig();
  const bypass = config.webfetch_cache?.bypass_url_patterns;
  if (urlMatchesBypass(url, bypass)) process.exit(0);

  const entry = await readCache(cachePath(url));
  if (!entry || (!entry.etag && !entry.last_modified)) process.exit(0);

  const headResult = await headRequest(url, {
    etag: entry.etag,
    last_modified: entry.last_modified,
  });

  if (!headResult) process.exit(0);
  if (headResult.status !== 304) process.exit(0); // 200, 5xx, etc. → real fetch

  // Cache hit confirmed by origin. Serve cached body via exit 2 + stderr.
  process.stderr.write(entry.body || '');
  process.exit(2);
}

main().catch(() => process.exit(0));
