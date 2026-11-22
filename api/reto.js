// 📱 Reto casa en el móvil, SOLO PARA MIRAR (2026-11-22).
//
//   Cara del PC (cabecera x-hub-token):
//     POST /api/reto  {token, data}   -> guarda la ÚLTIMA foto de los números del Reto (ya calculados en el PC)
//   Cara del móvil (con el token del enlace en `t`):
//     GET  /api/reto?t=TOK            -> esa foto, solo si el token coincide (si no, 404)
//
// Aquí NO hay ninguna dirección de la base del Reto: el PC la lee por su cuenta y sube solo los números. El token
// del enlace lo pone el PC junto a los datos (como el de «Subir a Vinted»), así que no hace falta tocar Vercel.
import { sql, ensureSchema } from '../lib/db.js';
import { checkToken, fail } from '../lib/auth.js';

let tablaLista = false;
async function tabla() {
  await ensureSchema();
  if (tablaLista) return;
  await sql`
    CREATE TABLE IF NOT EXISTS reto_movil (
      id         text PRIMARY KEY,
      token      text NOT NULL,
      data       text NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  tablaLista = true;
}

function parse(d) { try { return typeof d === 'object' ? d : JSON.parse(d || 'null'); } catch { return null; } }

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  try {
    if (req.method === 'POST') {                       // PC: sube los números
      if (!checkToken(req, res)) return;
      const b = req.body || {};
      const token = String(b.token || '').trim();
      if (token.length < 16 || !b.data || typeof b.data !== 'object') {
        return res.status(400).json({ ok: false, error: 'falta el token (16+) o los datos' });
      }
      await tabla();
      await sql`
        INSERT INTO reto_movil (id, token, data, updated_at)
        VALUES ('reto', ${token}, ${JSON.stringify(b.data)}, now())
        ON CONFLICT (id) DO UPDATE SET token = EXCLUDED.token, data = EXCLUDED.data, updated_at = now()
      `;
      return res.status(200).json({ ok: true });
    }
    if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'método no permitido' });

    const t = String((req.query && req.query.t) || '').trim();   // móvil: solo con el token del enlace
    if (t.length < 16) return res.status(404).json({ ok: false, error: 'no encontrado' });
    await tabla();
    const filas = await sql`SELECT token, data, updated_at FROM reto_movil WHERE id = 'reto'`;
    const f = filas[0];
    if (!f || f.token !== t) return res.status(404).json({ ok: false, error: 'no encontrado' });
    return res.status(200).json({ ok: true, data: parse(f.data), updated_at: f.updated_at });
  } catch (e) {
    fail(res, e);
  }
}
