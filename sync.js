/* ============================================================
   /api/sync — the only server-side code in this project.

   One blob per sync code, in the store named ibcal-blob.
   The code itself never lands in the blob store: the pathname is
   an HMAC of it, so knowing a filename tells you nothing and the
   code cannot be read back out of Vercel's dashboard.

   POST { code, action: 'pull' }             -> { rev, state }
   POST { code, action: 'push', payload }    -> { savedAt }
   POST { code, action: 'forget' }           -> deletes the blob
   ============================================================ */

import { put, list, del } from '@vercel/blob';
import crypto from 'node:crypto';

const MIN_CODE = 8;
const MAX_BYTES = 4 * 1024 * 1024;   // 4 MB of study data is a lot of study data

function pathFor(code){
  const salt = process.env.SYNC_SALT || 'ibcal-default-salt';
  const h = crypto.createHmac('sha256', salt)
    .update(String(code).trim().toLowerCase())
    .digest('hex');
  return `vaults/${h}.json`;
}

async function findBlob(pathname){
  const { blobs } = await list({ prefix: pathname, limit: 1 });
  return blobs.find(b => b.pathname === pathname) || null;
}

export default async function handler(req, res){
  res.setHeader('Cache-Control', 'no-store');

  if(req.method !== 'POST'){
    return res.status(405).json({ error: 'Use POST.' });
  }
  if(!process.env.BLOB_READ_WRITE_TOKEN){
    return res.status(500).json({ error: 'No blob store is connected to this project yet.' });
  }

  let body = req.body;
  if(typeof body === 'string'){ try{ body = JSON.parse(body); }catch{ body = null; } }
  const { code, action, payload } = body || {};

  if(!code || String(code).trim().length < MIN_CODE){
    return res.status(400).json({ error: `Your code needs at least ${MIN_CODE} characters.` });
  }

  const pathname = pathFor(code);

  try{
    if(action === 'pull'){
      const blob = await findBlob(pathname);
      if(!blob) return res.status(404).json({ error: 'No backup exists for that code yet.' });
      const r = await fetch(blob.url + '?v=' + Date.now(), { cache: 'no-store' });
      if(!r.ok) return res.status(502).json({ error: 'The backup could not be read.' });
      const saved = await r.json();
      return res.status(200).json({
        ok: true,
        rev: saved.rev || 0,
        state: saved.state || null,
        savedAt: saved.savedAt || blob.uploadedAt
      });
    }

    if(action === 'push'){
      if(!payload || !payload.state) return res.status(400).json({ error: 'Nothing to send.' });
      const savedAt = new Date().toISOString();
      const doc = JSON.stringify({ rev: payload.rev || Date.now(), savedAt, state: payload.state });
      if(doc.length > MAX_BYTES) return res.status(413).json({ error: 'That backup is too large to sync.' });
      await put(pathname, doc, {
        access: 'public',
        contentType: 'application/json',
        addRandomSuffix: false,
        allowOverwrite: true,
        cacheControlMaxAge: 0
      });
      return res.status(200).json({ ok: true, savedAt });
    }

    if(action === 'forget'){
      const blob = await findBlob(pathname);
      if(blob) await del(blob.url);
      return res.status(200).json({ ok: true, deleted: !!blob });
    }

    return res.status(400).json({ error: 'Unknown action.' });
  }catch(err){
    return res.status(500).json({ error: err && err.message ? err.message : 'Sync failed.' });
  }
}
