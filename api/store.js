// Almacen generico "pc_id -> blob JSON" que alimenta la WEB.
//   POST /api/store?tipo=estado        {pc_id, data}   -> un PC sube su blob
//   GET  /api/store?tipo=estado                         -> blobs de TODOS los PC
//   GET  /api/store?tipo=estado&pc_id=X                 -> el blob de un PC
//   DELETE /api/store?tipo=estado&pc_id=X               -> olvida un PC
//
// tipo ∈ {estado, catalogo, stats, inbox, secretos}. Cada tipo es una tabla con
// la misma forma (pc_id PK, data text, updated_at). Se despacha con plantillas
// explicitas por tabla porque el driver de Neon no interpola identificadores.
import { sql, ensureSchema } from '../lib/db.js';
import { checkToken, fail } from '../lib/auth.js';

const T = {
  estado: {
    up: (id, d) => sql`INSERT INTO estado (pc_id,data,updated_at) VALUES (${id},${d},now()) ON CONFLICT (pc_id) DO UPDATE SET data=EXCLUDED.data, updated_at=now()`,
    one: (id) => sql`SELECT pc_id,data,updated_at FROM estado WHERE pc_id=${id}`,
    all: () => sql`SELECT pc_id,data,updated_at FROM estado ORDER BY updated_at DESC`,
    del: (id) => sql`DELETE FROM estado WHERE pc_id=${id}`,
  },
  catalogo: {
    up: (id, d) => sql`INSERT INTO catalogo (pc_id,data,updated_at) VALUES (${id},${d},now()) ON CONFLICT (pc_id) DO UPDATE SET data=EXCLUDED.data, updated_at=now()`,
    one: (id) => sql`SELECT pc_id,data,updated_at FROM catalogo WHERE pc_id=${id}`,
    all: () => sql`SELECT pc_id,data,updated_at FROM catalogo ORDER BY updated_at DESC`,
    del: (id) => sql`DELETE FROM catalogo WHERE pc_id=${id}`,
  },
  stats: {
    up: (id, d) => sql`INSERT INTO stats (pc_id,data,updated_at) VALUES (${id},${d},now()) ON CONFLICT (pc_id) DO UPDATE SET data=EXCLUDED.data, updated_at=now()`,
    one: (id) => sql`SELECT pc_id,data,updated_at FROM stats WHERE pc_id=${id}`,
    all: () => sql`SELECT pc_id,data,updated_at FROM stats ORDER BY updated_at DESC`,
    del: (id) => sql`DELETE FROM stats WHERE pc_id=${id}`,
  },
  inbox: {
    up: (id, d) => sql`INSERT INTO inbox (pc_id,data,updated_at) VALUES (${id},${d},now()) ON CONFLICT (pc_id) DO UPDATE SET data=EXCLUDED.data, updated_at=now()`,
    one: (id) => sql`SELECT pc_id,data,updated_at FROM inbox WHERE pc_id=${id}`,
    all: () => sql`SELECT pc_id,data,updated_at FROM inbox ORDER BY updated_at DESC`,
    del: (id) => sql`DELETE FROM inbox WHERE pc_id=${id}`,
  },
  secretos: {
    up: (id, d) => sql`INSERT INTO secretos (pc_id,data,updated_at) VALUES (${id},${d},now()) ON CONFLICT (pc_id) DO UPDATE SET data=EXCLUDED.data, updated_at=now()`,
    one: (id) => sql`SELECT pc_id,data,updated_at FROM secretos WHERE pc_id=${id}`,
    all: () => sql`SELECT pc_id,data,updated_at FROM secretos ORDER BY updated_at DESC`,
    del: (id) => sql`DELETE FROM secretos WHERE pc_id=${id}`,
  },
};

function parse(d) {
  if (d && typeof d === 'object') return d;
  try { return JSON.parse(d || 'null'); } catch { return null; }
}

export default async function handler(req, res) {
  if (!checkToken(req, res)) return;
  try {
    await ensureSchema();
    const tipo = String((req.query && req.query.tipo) || (req.body && req.body.tipo) || '').trim();
    const t = T[tipo];
    if (!t) return res.status(400).json({ ok: false, error: 'tipo no válido' });

    if (req.method === 'POST') {
      const b = req.body || {};
      const pc_id = String(b.pc_id || '').trim();
      if (!pc_id) return res.status(400).json({ ok: false, error: 'falta pc_id' });
      let data = b.data;
      // merge: fusiona sobre lo que ya hay (para tocar unos campos sin borrar el
      // resto — p.ej. poner un secreto sin pisar los demás).
      if (b.merge) {
        const rows = await t.one(pc_id);
        const prev = rows.length ? parse(rows[0].data) : null;
        if (prev && typeof prev === 'object' && !Array.isArray(prev) &&
            data && typeof data === 'object' && !Array.isArray(data)) {
          data = Object.assign({}, prev, data);
        }
      }
      await t.up(pc_id, JSON.stringify(data === undefined ? null : data));
      return res.status(200).json({ ok: true, pc_id });
    }

    if (req.method === 'GET') {
      const pc_id = String((req.query && req.query.pc_id) || '').trim();
      if (pc_id) {
        const rows = await t.one(pc_id);
        if (!rows.length) return res.status(200).json({ ok: true, pc_id, data: null });
        return res.status(200).json({ ok: true, pc_id, data: parse(rows[0].data), updated_at: rows[0].updated_at });
      }
      const rows = await t.all();
      return res.status(200).json({
        ok: true,
        items: rows.map((r) => ({ pc_id: r.pc_id, data: parse(r.data), updated_at: r.updated_at })),
      });
    }

    if (req.method === 'DELETE') {
      const pc_id = String((req.query && req.query.pc_id) || '').trim();
      if (!pc_id) return res.status(400).json({ ok: false, error: 'falta pc_id' });
      await t.del(pc_id);
      return res.status(200).json({ ok: true });
    }

    res.status(405).json({ ok: false, error: 'método no permitido' });
  } catch (e) {
    fail(res, e);
  }
}
