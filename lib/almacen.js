// Lo que el hub GUARDA para lo que sigue en uso (desde 2026-10-10 hay un solo PC): el Reto del movil y el buzon
// «Subir a Vinted» del amigo (su lista de perfiles y su cola de subidas). Va al almacen de Vercel (lib/kv.js) si esta
// conectado; si no, a Neon (lib/db.js), como antes del 2026-11-23. Las rutas (api/reto.js, api/subir.js,
// api/health.js) no saben cual hay detras. Las rutas retiradas (ordenes, cuentas, config, apoyo, turno) siguen en Neon
// y nadie las llama.
import { hayKv, kv, kvVarios } from './kv.js';
import { sql, ensureSchema } from './db.js';

const RETO = 'reto_movil';
const PERFILES = 'movil_perfiles';
const COLA_IDS = 'movil_cola_ids';
const COLA_SIG = 'movil_cola_sig';
const colaClave = (id) => 'movil_cola:' + id;

function parse(d) { try { return typeof d === 'object' ? d : JSON.parse(d || 'null'); } catch { return null; } }

export function motor() {
  return hayKv() ? 'kv' : 'neon';
}

// ---------------------------------------------------------------------------------------------------- comprobar
export async function salud() {
  if (hayKv()) {
    await kv('PING');
    return;
  }
  await ensureSchema();
  await sql`SELECT 1`;
}

// ------------------------------------------------------------------------------------------- Reto en el movil
let tablaReto = false;
async function tablaRetoNeon() {
  await ensureSchema();
  if (tablaReto) return;
  await sql`CREATE TABLE IF NOT EXISTS reto_movil (id text PRIMARY KEY, token text NOT NULL, data text NOT NULL,
            updated_at timestamptz NOT NULL DEFAULT now())`;
  tablaReto = true;
}

export async function retoGuardar(token, data) {
  if (hayKv()) {
    await kv('SET', RETO, JSON.stringify({ token, data, updated_at: new Date().toISOString() }));
    return;
  }
  await tablaRetoNeon();
  await sql`
    INSERT INTO reto_movil (id, token, data, updated_at)
    VALUES ('reto', ${token}, ${JSON.stringify(data)}, now())
    ON CONFLICT (id) DO UPDATE SET token = EXCLUDED.token, data = EXCLUDED.data, updated_at = now()
  `;
}

// -> {token, data, updated_at} o null
export async function retoLeer() {
  if (hayKv()) {
    const f = parse(await kv('GET', RETO));
    return f && f.token ? f : null;
  }
  await tablaRetoNeon();
  const filas = await sql`SELECT token, data, updated_at FROM reto_movil WHERE id = 'reto'`;
  const f = filas[0];
  return f ? { token: f.token, data: parse(f.data), updated_at: f.updated_at } : null;
}

// --------------------------------------------------------------------------------- «Subir a Vinted»: perfiles
export async function perfilesGuardar(data) {
  const texto = JSON.stringify(data || {});
  if (hayKv()) {
    await kv('SET', PERFILES, texto);
    return;
  }
  await ensureSchema();
  await sql`INSERT INTO movil_perfiles (pc_id,data,updated_at) VALUES ('GLOBAL',${texto},now())
            ON CONFLICT (pc_id) DO UPDATE SET data=EXCLUDED.data, updated_at=now()`;
}

export async function perfilesLeer() {
  if (hayKv()) return parse(await kv('GET', PERFILES));
  await ensureSchema();
  const rows = await sql`SELECT data FROM movil_perfiles WHERE pc_id='GLOBAL'`;
  return rows.length ? parse(rows[0].data) : null;
}

// ---------------------------------------------------------------------------- «Subir a Vinted»: cola de subidas
// En el almacen: un numero que crece (movil_cola_sig), una lista con los ids en orden de llegada (movil_cola_ids) y
// cada subida en su clave (movil_cola:<id>), para leer 20 sin bajar las fotos de todas.
export async function colaMeter(data) {
  if (hayKv()) {
    const id = String(await kv('INCR', COLA_SIG));
    await kvVarios([
      ['SET', colaClave(id), JSON.stringify({ data, creado_en: new Date().toISOString() })],
      ['RPUSH', COLA_IDS, id],
    ]);
    return id;
  }
  await ensureSchema();
  await sql`INSERT INTO movil_cola (data) VALUES (${JSON.stringify(data)})`;
  return '';
}

// -> [{id, data, creado_en}] las `limite` mas antiguas
export async function colaLeer(limite = 20) {
  if (hayKv()) {
    const ids = (await kv('LRANGE', COLA_IDS, 0, limite - 1)) || [];
    if (!ids.length) return [];
    const valores = (await kv('MGET', ...ids.map(colaClave))) || [];
    const items = [];
    const huerfanos = [];
    ids.forEach((id, i) => {
      const f = parse(valores[i]);
      if (!f) { huerfanos.push(id); return; }
      items.push({ id: String(id), data: parse(f.data), creado_en: f.creado_en });
    });
    // Un id sin su subida (se borro a medias) no se queda en la lista para siempre.
    if (huerfanos.length) await kvVarios(huerfanos.map((id) => ['LREM', COLA_IDS, 0, id]));
    return items;
  }
  await ensureSchema();
  const rows = await sql`SELECT id, data, creado_en FROM movil_cola ORDER BY id LIMIT ${limite}`;
  return rows.map((r) => ({ id: String(r.id), data: parse(r.data), creado_en: r.creado_en }));
}

export async function colaBorrar(id) {
  if (hayKv()) {
    await kvVarios([['LREM', COLA_IDS, 0, id], ['DEL', colaClave(id)]]);
    return;
  }
  await ensureSchema();
  await sql`DELETE FROM movil_cola WHERE id=${id}`;
}
