// Conexion a la base de datos (Neon Postgres) y creacion perezosa del esquema.
//
// Se usa el driver serverless de Neon: cada consulta es una peticion HTTP, sin
// pool de conexiones, que es justo lo que quiere una funcion serverless de
// Vercel. La URL la inyecta la integracion de Neon/Postgres del panel de Vercel
// (variable DATABASE_URL, o POSTGRES_URL segun la integracion).
import { neon } from '@neondatabase/serverless';

const url =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.POSTGRES_URL_NON_POOLING ||
  '';

// Si falta la URL, neon() lanzaria al primer uso; damos un error claro antes.
export const sql = url ? neon(url) : null;

let esquemaListo = false;

export async function ensureSchema() {
  if (!sql) {
    throw new Error(
      'Falta DATABASE_URL: anade la integracion de Neon/Postgres en Vercel ' +
      '(Storage -> conectar al proyecto) y vuelve a desplegar.'
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
  esquemaListo = true;
}
