// GET /api/health -> comprueba token + base de datos. Lo usa el boton "Probar
// conexion" del panel y la pagina de inicio del hub.
import { ensureSchema, sql } from '../lib/db.js';
import { checkToken, fail } from '../lib/auth.js';

export default async function handler(req, res) {
  if (!checkToken(req, res)) return;
  try {
    await ensureSchema();
    await sql`SELECT 1`;
    res.status(200).json({ ok: true });
  } catch (e) {
    fail(res, e);
  }
}
