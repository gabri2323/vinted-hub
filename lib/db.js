// Conexion a la base de datos (Neon Postgres) y creacion perezosa del esquema.
//
// Se usa el driver serverless de Neon: cada consulta es una peticion HTTP, sin
// pool de conexiones, que es justo lo que quiere una funcion serverless de
// Vercel. La URL la inyecta la integracion de Neon/Postgres del panel de Vercel
// (variable DATABASE_URL, o POSTGRES_URL segun la integracion).
import { neon } from '@neondatabase/serverless';

// Busca la cadena de conexion de Postgres. Primero por los nombres habituales;
// si no, RASTREA todas las variables de entorno y coge la que sea una URL de
// Postgres (asi da igual con que nombre la haya puesto la integracion de Neon).
function findDbUrl() {
  const directo =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL_UNPOOLED ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.NEON_DATABASE_URL;
  if (directo) return directo;
  for (const v of Object.values(process.env)) {
    if (typeof v === 'string' && /^postgres(ql)?:\/\//.test(v)) return v;
  }
  return '';
}

const url = findDbUrl();

// Si falta la URL, neon() lanzaria al primer uso; damos un error claro antes.
export const sql = url ? neon(url) : null;

// Nombres (SIN valores) de las variables que podrian ser la BD, para diagnosticar.
export function dbEnvNames() {
  return Object.keys(process.env)
    .filter((k) => /(DATABASE|POSTGRES|NEON|PG|_URL)/i.test(k))
    .sort();
}

let esquemaListo = false;

export async function ensureSchema() {
  if (!sql) {
    throw new Error(
      'No hay conexion de Postgres. Variables candidatas presentes: [' +
      dbEnvNames().join(', ') +
      ']. Conecta la base de datos Neon al proyecto vinted-hub y redespliega.'
    );
  }
  if (esquemaListo) return;
  // Directorio de cuentas: una fila por PC, con su lista de estaciones (JSON en
  // texto: no consultamos dentro, asi que texto sobra y evita casteos).
  await sql`
    CREATE TABLE IF NOT EXISTS estaciones (
      pc_id      text PRIMARY KEY,
      pc_nombre  text,
      data       text NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  // Ordenes de publicacion. El dedup lo garantiza la PK orden_uid. El ejecutor
  // pide las 'pendiente' de SUS perfiles y luego las marca 'aplicada'.
  await sql`
    CREATE TABLE IF NOT EXISTS ordenes (
      orden_uid          text PRIMARY KEY,
      origen_pc          text,
      origen_nombre      text,
      destino_pc         text,
      destino_profile_id text NOT NULL,
      producto_uid       text NOT NULL,
      programada_en      text,
      max_intentos       int  NOT NULL DEFAULT 2,
      estado             text NOT NULL DEFAULT 'pendiente',
      creada_en          timestamptz NOT NULL DEFAULT now(),
      aplicada_en        timestamptz
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS ordenes_destino_idx
      ON ordenes (destino_profile_id, estado)
  `;
  // Ordenes de APOYO (abrir un enlace y correr un flujo de clicking en un
  // perfil). A diferencia de las de publicacion, no son programadas: el otro PC
  // las recoge y las corre en cuanto puede. El flujo (enlace + pasos) viaja en
  // `payload` como JSON en texto, porque cambia de forma y no se consulta dentro.
  await sql`
    CREATE TABLE IF NOT EXISTS apoyo_ordenes (
      orden_uid          text PRIMARY KEY,
      origen_pc          text,
      origen_nombre      text,
      destino_pc         text,
      destino_profile_id text NOT NULL,
      payload            text NOT NULL,
      estado             text NOT NULL DEFAULT 'pendiente',
      creada_en          timestamptz NOT NULL DEFAULT now(),
      aplicada_en        timestamptz
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS apoyo_destino_idx
      ON apoyo_ordenes (destino_profile_id, estado)
  `;
  // Config compartida: una fila por PC con sus ajustes de comportamiento (JSON en
  // texto). Es lo que hace que la web sea UNA para los dos PC: cada uno lee y
  // aplica la suya, y se edita desde cualquiera.
  await sql`
    CREATE TABLE IF NOT EXISTS config (
      pc_id      text PRIMARY KEY,
      data       text NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  // Almacenes "pc_id -> blob JSON" que alimentan la WEB (el cerebro). Cada PC
  // (la mano) SUBE aqui sus datos y la web los muestra; y BAJA de aqui lo que
  // debe obedecer. Todos comparten forma para poder servirlos con un solo
  // endpoint generico (api/store.js):
  //   estado    -> qué está haciendo cada PC ahora (online, acción, contadores, últimas líneas)
  //   catalogo  -> metadatos de productos (uid, título, precio, nº fotos) para programar desde la web
  //   stats     -> estadísticas por artículo (clicks/likes/ofertas)
  //   inbox     -> bandeja de mensajes leída por cada PC
  //   secretos  -> credenciales por PC (el usuario eligió guardarlas en la web; token-gated)
  await sql`CREATE TABLE IF NOT EXISTS estado   (pc_id text PRIMARY KEY, data text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`;
  await sql`CREATE TABLE IF NOT EXISTS catalogo (pc_id text PRIMARY KEY, data text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`;
  await sql`CREATE TABLE IF NOT EXISTS stats    (pc_id text PRIMARY KEY, data text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`;
  await sql`CREATE TABLE IF NOT EXISTS inbox    (pc_id text PRIMARY KEY, data text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`;
  await sql`CREATE TABLE IF NOT EXISTS secretos (pc_id text PRIMARY KEY, data text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`;
  esquemaListo = true;
}
