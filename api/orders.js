// Ordenes de publicacion.
//   POST /api/orders                  -> el director crea una orden
//   GET  /api/orders?profiles=a,b,c   -> ordenes 'pendiente' de esos perfiles
import { ensureSchema, sql } from '../lib/db.js';
import { checkToken, fail } from '../lib/auth.js';

export default async function handler(req, res) {
  if (!checkToken(req, res)) return;
  try {
    await ensureSchema();

    if (req.method === 'POST') {
      const b = req.body || {};
      const orden_uid = String(b.orden_uid || '').trim();
      const destino_profile_id = String(b.destino_profile_id || '').trim();
      const producto_uid = String(b.producto_uid || '').trim();
      if (!orden_uid || !destino_profile_id || !producto_uid) {
        return res.status(400).json({ ok: false, error: 'faltan datos de la orden' });
      }
      const max_intentos = Number.isFinite(+b.max_intentos) ? Math.max(0, +b.max_intentos) : 2;
      // ON CONFLICT DO NOTHING: si el director reintenta el POST, no duplica.
      await sql`
        INSERT INTO ordenes (orden_uid, origen_pc, origen_nombre, destino_pc,
                             destino_profile_id, producto_uid, programada_en,
                             max_intentos, estado, creada_en)
        VALUES (${orden_uid}, ${String(b.origen_pc || '')}, ${String(b.origen_nombre || '')},
                ${String(b.destino_pc || '')}, ${destino_profile_id}, ${producto_uid},
                ${String(b.programada_en || '')}, ${max_intentos}, 'pendiente', now())
        ON CONFLICT (orden_uid) DO NOTHING
      `;
      return res.status(200).json({ ok: true, orden_uid });
    }

    if (req.method === 'GET') {
      // La WEB pide TODAS las ordenes (programadas + historial) para mostrarlas.
      if (req.query && (req.query.all === '1' || req.query.all === 'true')) {
        const rows = await sql`
          SELECT orden_uid, origen_pc, origen_nombre, destino_pc, destino_profile_id,
                 producto_uid, programada_en, max_intentos, estado, creada_en, aplicada_en
          FROM ordenes ORDER BY creada_en DESC LIMIT 500
        `;
        return res.status(200).json({ ok: true, ordenes: rows });
      }
      const raw = String((req.query && req.query.profiles) || '').trim();
      if (!raw) return res.status(200).json({ ok: true, ordenes: [] });
      const perfiles = new Set(raw.split(',').map((s) => s.trim()).filter(Boolean));
      if (!perfiles.size) return res.status(200).json({ ok: true, ordenes: [] });
      // Se traen las pendientes y se filtran por perfil en JS: el volumen es
      // minimo (unas pocas a la vez) y asi no dependemos de como el driver
      // codifica los arrays para ANY(...), que no puedo probar aqui.
      const rows = await sql`
        SELECT orden_uid, origen_pc, origen_nombre, destino_pc, destino_profile_id,
               producto_uid, programada_en, max_intentos
        FROM ordenes
        WHERE estado = 'pendiente'
        ORDER BY creada_en ASC
        LIMIT 500
      `;
      const ordenes = rows
        .filter((o) => perfiles.has(String(o.destino_profile_id)))
        .slice(0, 200);
      return res.status(200).json({ ok: true, ordenes });
    }

    if (req.method === 'DELETE') {
      // La WEB cancela una orden aún pendiente (des-programar).
      const uid = String((req.query && req.query.orden_uid) || (req.body && req.body.orden_uid) || '').trim();
      if (!uid) return res.status(400).json({ ok: false, error: 'falta orden_uid' });
      await sql`DELETE FROM ordenes WHERE orden_uid = ${uid} AND estado = 'pendiente'`;
      return res.status(200).json({ ok: true, orden_uid: uid });
    }

    res.status(405).json({ ok: false, error: 'metodo no permitido' });
  } catch (e) {
    fail(res, e);
  }
}
