// GET /api/health -> comprueba token + almacén (el de Vercel o Neon, lib/almacen.js). Lo usa el boton "Probar
// conexion" del panel y la pagina de inicio del hub. Dice también qué variables de almacén ve (solo los NOMBRES), para
// saber por qué no usa el de Vercel si no lo usa.
import { salud, motor } from '../lib/almacen.js';
import { kvEnvNames } from '../lib/kv.js';
import { checkToken } from '../lib/auth.js';

export default async function handler(req, res) {
  if (!checkToken(req, res)) return;
  const almacen = motor();
  try {
    await salud();
    res.status(200).json({ ok: true, almacen, variables_almacen: kvEnvNames() });
  } catch (e) {
    res.status(500).json({ ok: false, error: String((e && e.message) || e), almacen, variables_almacen: kvEnvNames() });
  }
}
