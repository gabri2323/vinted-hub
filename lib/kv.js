// Almacen clave-valor del hub: Upstash Redis creado desde Vercel -> Storage (lo que antes era «Vercel KV").
//
// 2026-11-23: Neon (Postgres) se quedo sin cupo gratis (HTTP 402) y el hub dejo de guardar y servir nada. El usuario:
// «pásalo a vercel todo». Upstash gratis da 500.000 operaciones al mes (el hub gasta unas 15.000) y peticiones de hasta
// 10 MB (una subida del amigo con 4 fotos ronda 2 MB). Vercel Blob se descarto: 2.000 escrituras al mes y, si se pasa,
// 30 dias bloqueado.
//
// Sin dependencias: se habla con su API REST con fetch. Las credenciales las inyecta la integracion al conectarla al
// proyecto (KV_REST_API_URL / KV_REST_API_TOKEN, o UPSTASH_REDIS_REST_URL / _TOKEN); si se le puso un prefijo
// (PREFIJO_KV_REST_API_URL), tambien se encuentran.

function buscar(sufijos) {
  for (const s of sufijos) if (process.env[s]) return process.env[s];
  for (const [k, v] of Object.entries(process.env)) {
    if (typeof v === 'string' && v && sufijos.some((s) => k.endsWith(s)) && !/READ_ONLY/i.test(k)) return v;
  }
  return '';
}

function credenciales() {
  const url = buscar(['KV_REST_API_URL', 'UPSTASH_REDIS_REST_URL']);
  const token = buscar(['KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_TOKEN']);
  return url && token ? { url: url.replace(/\/+$/, ''), token } : null;
}

// ¿Esta conectado el almacen? Si no, el hub sigue con Neon (lib/db.js) como antes.
export function hayKv() {
  return !!credenciales();
}

// Nombres (SIN valores) de las variables que parecen de un almacen, para saber por que no se encuentra (lo ensena
// /api/health, que pide el token del hub).
export function kvEnvNames() {
  return Object.keys(process.env).filter((k) => /(KV|REDIS|UPSTASH)/i.test(k)).sort();
}

async function llamar(ruta, cuerpo) {
  const c = credenciales();
  if (!c) throw new Error('No hay almacén KV: conecta «Upstash for Redis» (Vercel → Storage) al proyecto y redespliega.');
  const r = await fetch(c.url + ruta, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + c.token, 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  });
  let j = null;
  try { j = await r.json(); } catch { /* sin cuerpo */ }
  if (!r.ok) throw new Error('KV: ' + ((j && j.error) || 'HTTP ' + r.status));
  return j;
}

// Un comando: kv('SET', 'clave', 'valor') -> su resultado.
export async function kv(...comando) {
  const j = await llamar('', comando.map(String));
  if (j && j.error) throw new Error('KV: ' + j.error);
  return j ? j.result : null;
}

// Varios comandos en una sola peticion: kvVarios([['SET','a','1'], ['RPUSH','l','a']]) -> [resultados].
export async function kvVarios(comandos) {
  if (!comandos.length) return [];
  const j = await llamar('/pipeline', comandos.map((c) => c.map(String)));
  if (!Array.isArray(j)) throw new Error('KV: respuesta rara del pipeline');
  return j.map((x) => {
    if (x && x.error) throw new Error('KV: ' + x.error);
    return x ? x.result : null;
  });
}
