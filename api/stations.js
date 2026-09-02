// Directorio de cuentas.
//   POST /api/stations  -> un PC anuncia sus cuentas (upsert por pc_id)
//   GET  /api/stations  -> lee las cuentas de TODOS los PC (para el desplegable)
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
      const pc_nombre = String(b.pc_nombre || pc_id);
      const estaciones = Array.isArray(b.estaciones) ? b.estaciones : [];
      await sql`
        INSERT INTO estaciones (pc_id, pc_nombre, data, updated_at)
        VALUES (${pc_id}, ${pc_nombre}, ${JSON.stringify(estaciones)}, now())
        ON CONFLICT (pc_id) DO UPDATE
          SET pc_nombre = EXCLUDED.pc_nombre,
              data       = EXCLUDED.data,
              updated_at = now()
      `;
      return res.status(200).json({ ok: true, cuentas: estaciones.length });
    }

    if (req.method === 'GET') {
      const rows = await sql`
        SELECT pc_id, pc_nombre, data, updated_at
        FROM estaciones ORDER BY updated_at DESC
      `;
      const pcs = rows.map((r) => ({
        pc_id: r.pc_id,
        pc_nombre: r.pc_nombre,
        updated_at: r.updated_at,
        estaciones: parseData(r.data),
      }));
      return res.status(200).json({ ok: true, pcs });
    }

    if (req.method === 'DELETE') {
      const pc_id = String(
        (req.query && req.query.pc_id) || (req.body && req.body.pc_id) || ''
      ).trim();
      if (!pc_id) return res.status(400).json({ ok: false, error: 'falta pc_id' });
      await sql`DELETE FROM estaciones WHERE pc_id = ${pc_id}`;
      return res.status(200).json({ ok: true, borrado: pc_id });
    }

    res.status(405).json({ ok: false, error: 'metodo no permitido' });
  } catch (e) {
    fail(res, e);
  }
}

function parseData(d) {
  if (Array.isArray(d)) return d;
  try {
    const v = JSON.parse(d || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
