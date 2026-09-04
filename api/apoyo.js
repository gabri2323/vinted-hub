// Ordenes de APOYO (abrir un enlace y correr un flujo de clicking en un perfil).
//   POST   /api/apoyo                    -> el director crea una orden de apoyo
//   GET    /api/apoyo?profiles=a,b,c     -> ordenes 'pendiente' de esos perfiles
//   GET    /api/apoyo?all=1              -> todas (para la web / diagnostico)
//   DELETE /api/apoyo?orden_uid=X        -> marcar una orden como aplicada
//
// El flujo (enlace + pasos) viaja en `payload` (JSON). A diferencia de las
// ordenes de publicacion NO son programadas: el otro PC las corre al recogerlas.
import { ensureSchema, sql } from '../lib/db.js';
import { checkToken, fail } from '../lib/auth.js';

function parse(d) {
  if (d && typeof d === 'object') return d;
  try { return JSON.parse(d || 'null'); } catch { return null; }
}

export default async function handler(req, res) {
  if (!checkToken(req, res)) return;
  try {
    await ensureSchema();

    if (req.method === 'POST') {
      const b = req.body || {};
      const orden_uid = String(b.orden_uid || '').trim();
      const destino_profile_id = String(b.destino_profile_id || '').trim();
      const payload = b.payload;
      if (!orden_uid || !destino_profile_id || payload == null) {
        return res.status(400).json({ ok: false, error: 'faltan datos de la orden de apoyo' });
      }
      const payloadTexto = typeof payload === 'string' ? payload : JSON.stringify(payload);
      // ON CONFLICT DO NOTHING: si el director reintenta el POST, no duplica.
      await sql`
        INSERT INTO apoyo_ordenes (orden_uid, origen_pc, origen_nombre, destino_pc,
                                   destino_profile_id, payload, estado, creada_en)
        VALUES (${orden_uid}, ${String(b.origen_pc || '')}, ${String(b.origen_nombre || '')},
                ${String(b.destino_pc || '')}, ${destino_profile_id}, ${payloadTexto},
                'pendiente', now())
        ON CONFLICT (orden_uid) DO NOTHING
      `;
      return res.status(200).json({ ok: true, orden_uid });
    }

    if (req.method === 'GET') {
      if (req.query && (req.query.all === '1' || req.query.all === 'true')) {
        const rows = await sql`
          SELECT orden_uid, origen_pc, origen_nombre, destino_pc, destino_profile_id,
                 payload, estado, creada_en, aplicada_en
          FROM apoyo_ordenes ORDER BY creada_en DESC LIMIT 500
        `;
        return res.status(200).json({
          ok: true,
          ordenes: rows.map((o) => ({ ...o, payload: parse(o.payload) })),
        });
      }
      const raw = String((req.query && req.query.profiles) || '').trim();
      if (!raw) return res.status(200).json({ ok: true, ordenes: [] });
      const perfiles = new Set(raw.split(',').map((s) => s.trim()).filter(Boolean));
      if (!perfiles.size) return res.status(200).json({ ok: true, ordenes: [] });
      // Se filtra por perfil en JS (el volumen es minimo), igual que en orders.js.
      const rows = await sql`
        SELECT orden_uid, origen_pc, origen_nombre, destino_pc, destino_profile_id, payload
        FROM apoyo_ordenes
        WHERE estado = 'pendiente'
        ORDER BY creada_en ASC
        LIMIT 500
      `;
      const ordenes = rows
        .filter((o) => perfiles.has(String(o.destino_profile_id)))
        .slice(0, 200)
        .map((o) => ({ ...o, payload: parse(o.payload) }));
      return res.status(200).json({ ok: true, ordenes });
    }

    if (req.method === 'DELETE') {
      // El ejecutor marca la orden como aplicada (no se borra: queda el historial).
      const uid = String(
        (req.query && req.query.orden_uid) || (req.body && req.body.orden_uid) || ''
      ).trim();
      if (!uid) return res.status(400).json({ ok: false, error: 'falta orden_uid' });
      await sql`
        UPDATE apoyo_ordenes SET estado = 'aplicada', aplicada_en = now()
        WHERE orden_uid = ${uid}
      `;
      return res.status(200).json({ ok: true, orden_uid: uid });
    }

    res.status(405).json({ ok: false, error: 'metodo no permitido' });
  } catch (e) {
    fail(res, e);
  }
}
