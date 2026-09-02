// Config compartida por PC (una web, dos configuraciones).
//   POST /api/config  {pc_id, settings, ts, origen}  -> upsert de la config de un PC
//   GET  /api/config                                  -> {pcs:[...]}  (la de todos)
//   GET  /api/config?pc_id=X                          -> {settings, ts, ...} (la de uno)
//   DELETE /api/config?pc_id=X                         -> olvida un PC
//
// Solo guarda ajustes de COMPORTAMIENTO (no secretos); el cliente decide que sube
// (ver app/ajustes.py CLAVES_COMPARTIDAS). El hub no interpreta el contenido.
import { ensureSchema, sql } from '../lib/db.js';
import { checkToken, fail } from '../lib/auth.js';

export default async function handler(req, res) {
  if (!checkToken(req, res)) return;
  try {
    await ensureSchema();

    if (req.method === 'POST') {
      const b = req.body || {};
      const pc_id = String(b.pc_id || '').trim();
      if (!pc_id) return res.status(400).json({ ok: false, error: 'falta pc_id' });
      const data = JSON.stringify({
        settings: (b.settings && typeof b.settings === 'object') ? b.settings : {},
        ts: String(b.ts || ''),
        origen: String(b.origen || ''),
      });
      await sql`
        INSERT INTO config (pc_id, data, updated_at)
        VALUES (${pc_id}, ${data}, now())
        ON CONFLICT (pc_id) DO UPDATE
          SET data = EXCLUDED.data, updated_at = now()
      `;
      return res.status(200).json({ ok: true, pc_id });
    }

    if (req.method === 'GET') {
      const pc_id = String((req.query && req.query.pc_id) || '').trim();
      if (pc_id) {
        const rows = await sql`SELECT pc_id, data, updated_at FROM config WHERE pc_id = ${pc_id}`;
        if (!rows.length) return res.status(200).json({ ok: true, pc_id, settings: null });
        const d = parseData(rows[0].data);
        return res.status(200).json({
          ok: true, pc_id, settings: d.settings, ts: d.ts, origen: d.origen,
          updated_at: rows[0].updated_at,
        });
      }
      const rows = await sql`SELECT pc_id, data, updated_at FROM config ORDER BY updated_at DESC`;
      const pcs = rows.map((r) => {
        const d = parseData(r.data);
        return { pc_id: r.pc_id, settings: d.settings, ts: d.ts, origen: d.origen, updated_at: r.updated_at };
      });
      return res.status(200).json({ ok: true, pcs });
    }

    if (req.method === 'DELETE') {
      const pc_id = String(
        (req.query && req.query.pc_id) || (req.body && req.body.pc_id) || ''
      ).trim();
      if (!pc_id) return res.status(400).json({ ok: false, error: 'falta pc_id' });
      await sql`DELETE FROM config WHERE pc_id = ${pc_id}`;
      return res.status(200).json({ ok: true, borrado: pc_id });
    }

    res.status(405).json({ ok: false, error: 'metodo no permitido' });
  } catch (e) {
    fail(res, e);
  }
}

function parseData(d) {
  if (d && typeof d === 'object') {
    return { settings: d.settings || {}, ts: d.ts || '', origen: d.origen || '' };
  }
  try {
    const v = JSON.parse(d || '{}');
    return { settings: v.settings || {}, ts: v.ts || '', origen: v.origen || '' };
  } catch {
    return { settings: {}, ts: '', origen: '' };
  }
}
