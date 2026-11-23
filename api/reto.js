// 📱 Reto casa en el móvil, SOLO PARA MIRAR (2026-11-22).
//
//   Cara del PC (cabecera x-hub-token):
//     POST /api/reto  {token, data}   -> guarda la ÚLTIMA foto de los números del Reto (ya calculados en el PC)
//   Cara del móvil (con el token del enlace en `t`):
//     GET  /api/reto?t=TOK            -> esa foto, solo si el token coincide (si no, 404)
//
// Aquí NO hay ninguna dirección de la base del Reto: el PC la lee por su cuenta y sube solo los números. El token
// del enlace lo pone el PC junto a los datos (como el de «Subir a Vinted»), así que no hace falta tocar Vercel.
// Dónde se guarda (el almacén de Vercel o Neon) lo decide lib/almacen.js (2026-11-23).
import { retoGuardar, retoLeer } from '../lib/almacen.js';
import { checkToken, fail } from '../lib/auth.js';

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
      await retoGuardar(token, b.data);
      return res.status(200).json({ ok: true });
    }
    if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'método no permitido' });

    const t = String((req.query && req.query.t) || '').trim();   // móvil: solo con el token del enlace
    if (t.length < 16) return res.status(404).json({ ok: false, error: 'no encontrado' });
    const f = await retoLeer();
    if (!f || f.token !== t) return res.status(404).json({ ok: false, error: 'no encontrado' });
    return res.status(200).json({ ok: true, data: f.data, updated_at: f.updated_at });
  } catch (e) {
    fail(res, e);
  }
}
