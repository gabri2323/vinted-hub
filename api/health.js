// GET /api/health -> comprueba token + almacén (el de Vercel o Neon, lib/almacen.js). Lo usa el boton "Probar
// conexion" del panel y la pagina de inicio del hub.
import { salud, motor } from '../lib/almacen.js';
import { checkToken, fail } from '../lib/auth.js';

export default async function handler(req, res) {
  if (!checkToken(req, res)) return;
  try {
    await salud();
    res.status(200).json({ ok: true, almacen: motor() });
  } catch (e) {
    fail(res, e);
  }
}
