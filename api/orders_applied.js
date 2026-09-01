// POST /api/orders_applied  -> el ejecutor marca una orden como aplicada, para
// que el hub deje de mandarsela. Idempotente.
import { ensureSchema, sql } from '../lib/db.js';
import { checkToken, fail } from '../lib/auth.js';

export default async function handler(req, res) {
  if (!checkToken(req, res)) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'metodo no permitido' });
  }
  try {
    await ensureSchema();
    const b = req.body || {};
    const orden_uid = String(b.orden_uid || '').trim();
    if (!orden_uid) return res.status(400).json({ ok: false, error: 'falta orden_uid' });
    await sql`
      UPDATE ordenes SET estado = 'aplicada', aplicada_en = now()
      WHERE orden_uid = ${orden_uid}
    `;
    res.status(200).json({ ok: true });
  } catch (e) {
    fail(res, e);
  }
}
