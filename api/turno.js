// TURNO GLOBAL: quien puede tener un perfil de Dolphin abierto AHORA.
//   POST   /api/turno   {pc_id, pc_nombre, perfil, motivo, segundos}
//                       -> toma el turno si esta libre, o lo RENUEVA si ya era suyo.
//                          {ok:true, mio:true, hasta} | {ok:true, mio:false, de:{...}}
//   GET    /api/turno   -> quien lo tiene ahora {ok:true, libre, de:{...}}
//   DELETE /api/turno?pc_id=X -> soltarlo (solo lo suelta quien lo tiene)
//
// POR QUE EXISTE. Dolphin{anty} solo admite UN perfil abierto a la vez, y ese
// limite es de la CUENTA, no del ordenador: los dos PC comparten cuenta, asi
// que si los dos abren a la vez uno de los dos se queda sin ventana a mitad de
// la faena. FALLO REAL del 2026-09-20: tres tareas (dos publicaciones y un
// apoyo) murieron con "No encuentro la ventana del perfil" justo cuando el otro
// PC estaba corriendo ordenes de apoyo. Cada PC ya tenia su candado, pero
// ninguno veia al otro; este es el unico sitio que ven los dos.
//
// El turno CADUCA solo (`hasta`). Es deliberado: si un PC se cuelga o se queda
// sin luz con el turno cogido, el otro no puede quedarse esperando para
// siempre. Mientras trabaja lo va renovando, asi que solo caduca de verdad
// cuando el que lo tenia ya no esta.
import { ensureSchema, sql } from '../lib/db.js';
import { checkToken, fail } from '../lib/auth.js';

const ID = 'global';            // solo hay un turno: el de abrir perfiles
const MAX_SEGUNDOS = 3600;      // tope de cordura: nadie retiene una hora
const POR_DEFECTO = 420;

function fila(r) {
  if (!r) return null;
  return {
    pc_id: r.pc_id,
    pc_nombre: r.pc_nombre || r.pc_id,
    perfil: r.perfil || '',
    motivo: r.motivo || '',
    hasta: r.hasta,
    tomado_en: r.tomado_en,
  };
}

export default async function handler(req, res) {
  if (!checkToken(req, res)) return;
  try {
    await ensureSchema();

    if (req.method === 'POST') {
      const b = req.body || {};
      const pc_id = String(b.pc_id || '').trim();
      if (!pc_id) return res.status(400).json({ ok: false, error: 'falta pc_id' });
      let segundos = parseInt(b.segundos, 10);
      if (!Number.isFinite(segundos) || segundos <= 0) segundos = POR_DEFECTO;
      segundos = Math.min(segundos, MAX_SEGUNDOS);

      // Toma-o-renueva ATOMICO: el WHERE es la condicion de carrera. Solo entra
      // si el turno ya era de este PC (renovacion) o si el anterior ha caducado.
      // Si no entra, es que lo tiene otro y sigue vivo.
      const filas = await sql`
        INSERT INTO turno (id, pc_id, pc_nombre, perfil, motivo, hasta, tomado_en)
        VALUES (${ID}, ${pc_id}, ${String(b.pc_nombre || '')}, ${String(b.perfil || '')},
                ${String(b.motivo || '')}, now() + (${String(segundos)} || ' seconds')::interval, now())
        ON CONFLICT (id) DO UPDATE
           SET pc_id     = EXCLUDED.pc_id,
               pc_nombre = EXCLUDED.pc_nombre,
               perfil    = EXCLUDED.perfil,
               motivo    = EXCLUDED.motivo,
               hasta     = EXCLUDED.hasta,
               tomado_en = CASE WHEN turno.pc_id = EXCLUDED.pc_id
                                THEN turno.tomado_en ELSE now() END
         WHERE turno.pc_id = ${pc_id} OR turno.hasta < now()
        RETURNING pc_id, pc_nombre, perfil, motivo, hasta, tomado_en
      `;
      if (filas.length) {
        return res.status(200).json({ ok: true, mio: true, de: fila(filas[0]) });
      }
      const actual = await sql`
        SELECT pc_id, pc_nombre, perfil, motivo, hasta, tomado_en FROM turno WHERE id = ${ID}
      `;
      return res.status(200).json({ ok: true, mio: false, de: fila(actual[0]) });
    }

    if (req.method === 'GET') {
      const filas = await sql`
        SELECT pc_id, pc_nombre, perfil, motivo, hasta, tomado_en,
               (hasta < now()) AS caducado
        FROM turno WHERE id = ${ID}
      `;
      const r = filas[0];
      return res.status(200).json({
        ok: true,
        libre: !r || r.caducado === true,
        de: r && r.caducado !== true ? fila(r) : null,
      });
    }

    if (req.method === 'DELETE') {
      const pc_id = String((req.query && req.query.pc_id) || '').trim();
      if (!pc_id) return res.status(400).json({ ok: false, error: 'falta pc_id' });
      // Solo suelta quien lo tiene: un DELETE despistado no puede abrirle la
      // puerta a un tercero mientras otro PC sigue con su perfil abierto.
      const filas = await sql`
        DELETE FROM turno WHERE id = ${ID} AND pc_id = ${pc_id} RETURNING pc_id
      `;
      return res.status(200).json({ ok: true, soltado: filas.length > 0 });
    }

    return res.status(405).json({ ok: false, error: 'metodo no permitido' });
  } catch (e) {
    return fail(res, e);
  }
}
