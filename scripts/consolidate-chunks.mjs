/**
 * Consolidate chunked files into single GitHub Release assets.
 *
 * Why: large uploads made through the deployed site are split into many parts
 * (Vercel request-body limit). A chunked file cannot be served as a single
 * direct GitHub link, so downloads would have to be re-merged through Vercel
 * (consuming Vercel bandwidth). Merging the parts into ONE asset lets every
 * download/link point straight at GitHub (0 bytes of Vercel bandwidth).
 *
 * Usage:
 *   node scripts/consolidate-chunks.mjs            # process all chunked files
 *   node scripts/consolidate-chunks.mjs --limit 1   # process a single file (test)
 *
 * Safe by design:
 *   - Part assets are NOT deleted (rollback stays possible).
 *   - db.json is backed up to the OS temp dir before being replaced.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

const ROOT = process.cwd();
const METADATA_TAG = 'storage-metadata';
const FILES_TAG = 'storage-files';

function loadEnv() {
  const txt = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf-8');
  const env = {};
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    env[m[1]] = v;
  }
  return env;
}

const env = loadEnv();
const TOKEN = env.GITHUB_TOKEN || env.NEXT_PUBLIC_GITHUB_TOKEN;
const OWNER = env.GITHUB_OWNER || env.NEXT_PUBLIC_GITHUB_OWNER;
const REPO = env.GITHUB_REPO || env.NEXT_PUBLIC_GITHUB_REPO;

if (!TOKEN || !OWNER || !REPO) {
  console.error('Missing GitHub configuration in .env.local');
  process.exit(1);
}

const API = 'https://api.github.com';
const UPLOAD = 'https://uploads.github.com';
const BASE_HEADERS = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'hanswy-consolidate',
};

const limitArgIndex = process.argv.indexOf('--limit');
const LIMIT = limitArgIndex > -1 ? parseInt(process.argv[limitArgIndex + 1], 10) : Infinity;
const onlyArgIndex = process.argv.indexOf('--only');
const ONLY = onlyArgIndex > -1 ? process.argv[onlyArgIndex + 1] : null;

async function getReleaseByTag(tag) {
  const res = await fetch(`${API}/repos/${OWNER}/${REPO}/releases/tags/${tag}`, { headers: BASE_HEADERS });
  if (!res.ok) throw new Error(`get release "${tag}": ${res.status} ${await res.text()}`);
  return res.json();
}

async function listAllAssets(releaseId) {
  const all = [];
  for (let page = 1; ; page++) {
    const res = await fetch(
      `${API}/repos/${OWNER}/${REPO}/releases/${releaseId}/assets?per_page=100&page=${page}`,
      { headers: BASE_HEADERS }
    );
    if (!res.ok) throw new Error(`list assets: ${res.status} ${await res.text()}`);
    const arr = await res.json();
    all.push(...arr);
    if (arr.length < 100) break;
  }
  return all;
}

const PART_CONCURRENCY = 6;
const PART_TIMEOUT_MS = 60000;
const PART_RETRIES = 4;

async function downloadAsset(asset) {
  // Utamakan URL CDN publik (jauh lebih cepat & bebas rate-limit API GitHub).
  // Fallback ke endpoint API (butuh token) untuk repo privat.
  const direct = typeof asset === 'object' && asset.browser_download_url;
  const url = direct
    ? asset.browser_download_url
    : `${API}/repos/${OWNER}/${REPO}/releases/assets/${typeof asset === 'object' ? asset.id : asset}`;
  const headers = direct
    ? { 'User-Agent': 'hanswy-consolidate' }
    : { ...BASE_HEADERS, Accept: 'application/octet-stream' };
  const label = typeof asset === 'object' ? asset.name : asset;

  let lastErr;
  for (let attempt = 1; attempt <= PART_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        headers,
        redirect: 'follow',
        signal: AbortSignal.timeout(PART_TIMEOUT_MS),
      });
      if (!res.ok) {
        throw new Error(`download asset ${label}: ${res.status} ${await res.text()}`);
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (direct && typeof asset === 'object' && buf.length !== asset.size) {
        throw new Error(`size mismatch for ${label}: got ${buf.length}, expected ${asset.size}`);
      }
      return buf;
    } catch (err) {
      lastErr = err;
      if (attempt < PART_RETRIES) {
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
  }
  throw lastErr;
}

// Run `worker` over `items` with a bounded number of concurrent tasks,
// keeping the original order in the returned array.
async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function runner() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runner));
  return results;
}

async function uploadAsset(releaseId, name, buffer, contentType) {
  const url = `${UPLOAD}/repos/${OWNER}/${REPO}/releases/${releaseId}/assets?name=${encodeURIComponent(name)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...BASE_HEADERS, 'Content-Type': contentType || 'application/octet-stream' },
    body: buffer,
  });
  if (!res.ok) throw new Error(`upload "${name}": ${res.status} ${await res.text()}`);
  return res.json();
}

async function deleteAsset(assetId) {
  const res = await fetch(`${API}/repos/${OWNER}/${REPO}/releases/assets/${assetId}`, {
    method: 'DELETE',
    headers: BASE_HEADERS,
  });
  if (!res.ok && res.status !== 404) throw new Error(`delete asset ${assetId}: ${res.status}`);
}

function mb(bytes) {
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

async function main() {
  const metaRelease = await getReleaseByTag(METADATA_TAG);
  const filesRelease = await getReleaseByTag(FILES_TAG);

  const metaAssets = await listAllAssets(metaRelease.id);
  const dbAsset = metaAssets.find((a) => a.name === 'db.json');
  if (!dbAsset) throw new Error('db.json asset not found in storage-metadata release');

  const dbBuffer = await downloadAsset(dbAsset);
  const backupPath = path.join(os.tmpdir(), `hanswy-db-backup-${Date.now()}.json`);
  fs.writeFileSync(backupPath, dbBuffer);
  console.log(`db.json backup saved -> ${backupPath}`);

  const db = JSON.parse(dbBuffer.toString('utf-8'));
  const filesAssets = await listAllAssets(filesRelease.id);
  const byName = new Map(filesAssets.map((a) => [a.name, a]));

  const chunked = db.files.filter(
    (f) => typeof f.download_url === 'string' && f.download_url.startsWith('chunked:')
  );
  const filtered = ONLY ? chunked.filter((f) => f.name.includes(ONLY) || f.id === ONLY) : chunked;
  const targets = filtered.slice(0, LIMIT);
  console.log(`Chunked files: ${chunked.length} | processing: ${targets.length}\n`);

  let index = 0;
  for (const file of targets) {
    index++;
    const parts = file.download_url.split(':');
    const totalParts = parseInt(parts[1], 10);
    const storagePath = parts.slice(2).join(':');
    console.log(`[${index}/${targets.length}] ${file.name} — ${mb(file.size)}, ${totalParts} parts`);

    let mergedAsset = byName.get(storagePath);

    if (mergedAsset) {
      console.log(`  merged asset already exists (${mb(mergedAsset.size)}) -> reusing`);
    } else {
      const partAssets = [];
      for (let i = 0; i < totalParts; i++) {
        const part = byName.get(`${storagePath}_part${i}`);
        if (!part) throw new Error(`missing part ${i} for ${storagePath}`);
        partAssets.push(part);
      }

      let done = 0;
      const buffers = await mapLimit(partAssets, PART_CONCURRENCY, async (part) => {
        const buf = await downloadAsset(part);
        done++;
        process.stdout.write(`\r  downloading parts ${done}/${totalParts}...`);
        return buf;
      });
      process.stdout.write('\n');

      const merged = Buffer.concat(buffers);
      console.log(`  merged: ${mb(merged.length)} (metadata says ${mb(file.size)})`);
      if (merged.length !== file.size) {
        console.warn('  ! WARNING: merged size differs from metadata size');
      }

      mergedAsset = await uploadAsset(filesRelease.id, storagePath, merged, file.mime_type);
      byName.set(storagePath, mergedAsset);
      console.log(`  uploaded single asset -> ${mergedAsset.browser_download_url}`);
    }

    file.download_url = mergedAsset.browser_download_url;
    file.github_asset_id = mergedAsset.id;
  }

  const updatedBuffer = Buffer.from(JSON.stringify(db, null, 2), 'utf-8');
  console.log(`\nUpdating db.json (${updatedBuffer.length} bytes)...`);
  await deleteAsset(dbAsset.id);
  try {
    const uploaded = await uploadAsset(metaRelease.id, 'db.json', updatedBuffer, 'application/json');
    console.log(`db.json updated -> ${uploaded.browser_download_url}`);
  } catch (err) {
    console.error('Failed to upload new db.json, restoring backup...', err);
    await uploadAsset(metaRelease.id, 'db.json', dbBuffer, 'application/json');
    console.log('backup restored');
    throw err;
  }

  console.log('\nDONE. Remaining chunked files:', Math.max(0, chunked.length - targets.length));
}

main().catch((err) => {
  console.error('\nERROR:', err);
  process.exit(1);
});
