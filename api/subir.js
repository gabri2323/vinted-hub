// Buzon MOVIL: un amigo sube una foto (+ perfiles elegidos) desde el movil, sin
// tocar el token del hub. Queda en cola y el PC la procesa (Gemini -> propuesta).
//
//   Cara PUBLICA (el amigo, con el TOKEN MOVIL en `t`):
//     GET  /api/subir?t=TOK&perfiles=1     -> lista de perfiles (los 7) para elegir
//     POST /api/subir   {t, foto, foto_mime, fotos?, objetivos, de_quien, pista}
//                                          -> mete la subida en la cola
//   Cara del PC (con la cabecera x-hub-token del hub):
//     GET    /api/subir?cola=1             -> subidas pendientes (para procesarlas)
//     DELETE /api/subir?id=N               -> borrar una ya procesada
//     POST   /api/subir?perfiles=1  {data:{perfiles, token}} -> el PC publica perfiles + token
//
// El TOKEN MOVIL lo PUBLICA el PC en el almacen (data.token de los perfiles), asi el
// usuario NO tiene que tocar variables en Vercel. Como respaldo tambien vale el env
// MOVIL_TOKEN si estuviera puesto. Ese token solo abre la puerta de subir, nunca da
// acceso al resto del hub. Donde se guarda (el almacen de Vercel o Neon) lo decide
// lib/almacen.js (2026-11-23).
import { perfilesGuardar, perfilesLeer, colaMeter, colaLeer, colaBorrar } from '../lib/almacen.js';
import { checkToken, fail } from '../lib/auth.js';

function perfilesDe(raw) { return Array.isArray(raw) ? raw : ((raw && raw.perfiles) || []); }

async function okMovil(req) {
  let esperado = '';
  try {
    const raw = await perfilesLeer();
    if (raw && !Array.isArray(raw) && raw.token) esperado = String(raw.token);
  } catch { /* usa el env de respaldo */ }
  if (!esperado) esperado = process.env.MOVIL_TOKEN || '';
  const recibido = String((req.query && req.query.t) || (req.body && req.body.t) || '');
  return !!esperado && recibido === esperado;
}

export default async function handler(req, res) {
  try {
    const q = req.query || {};
    const esCola = q.cola !== undefined;
    const esPerfiles = q.perfiles !== undefined;

    if (req.method === 'GET') {
      if (esCola) {                                   // PC: subidas pendientes
        if (!checkToken(req, res)) return;
        return res.status(200).json({ ok: true, items: await colaLeer(20) });
      }
      if (esPerfiles) {                               // amigo: lista de perfiles
        if (!(await okMovil(req))) return res.status(401).json({ ok: false, error: 'token no válido' });
        return res.status(200).json({ ok: true, perfiles: perfilesDe(await perfilesLeer()) });
      }
      return res.status(400).json({ ok: false, error: 'falta cola o perfiles' });
    }

    if (req.method === 'POST') {
      if (esPerfiles) {                               // PC: publica perfiles + token
        if (!checkToken(req, res)) return;
        await perfilesGuardar((req.body && req.body.data) || {});
        return res.status(200).json({ ok: true });
      }
      // amigo: nueva subida a la cola
      if (!(await okMovil(req))) return res.status(401).json({ ok: false, error: 'token no válido' });
      const b = req.body || {};
      const fotos = Array.isArray(b.fotos) ? b.fotos : (b.foto ? [{ b64: b.foto, mime: b.foto_mime || 'image/jpeg' }] : []);
      if (!fotos.length) return res.status(400).json({ ok: false, error: 'falta la foto' });
      await colaMeter({
        fotos: fotos.slice(0, 4),
        objetivos: Array.isArray(b.objetivos) ? b.objetivos.slice(0, 10) : [],
        de_quien: String(b.de_quien || '').slice(0, 60),
        pista: String(b.pista || '').slice(0, 200),
        precio: String(b.precio || '').slice(0, 20),
        isbn: String(b.isbn || '').slice(0, 20),
      });
      return res.status(200).json({ ok: true });
    }

    if (req.method === 'DELETE') {                    // PC: borrar una procesada
      if (!checkToken(req, res)) return;
      const id = String(q.id || '').trim();
      if (!id) return res.status(400).json({ ok: false, error: 'falta id' });
      await colaBorrar(id);
      return res.status(200).json({ ok: true });
    }

    res.status(405).json({ ok: false, error: 'método no permitido' });
  } catch (e) {
    fail(res, e);
  }
}
