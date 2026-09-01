// Autenticacion por secreto compartido. Todas las peticiones a /api/* llevan la
// cabecera `x-hub-token`, que debe coincidir con la variable HUB_TOKEN del
// servidor (configurada en Vercel). Sin ella, cualquiera podria dejar ordenes.
export function checkToken(req, res) {
  const esperado = process.env.HUB_TOKEN || '';
  const recibido = req.headers['x-hub-token'] || '';
  if (!esperado) {
    res.status(500).json({
      ok: false,
      error: 'HUB_TOKEN no esta configurado en el servidor (Vercel -> Settings -> Environment Variables).',
    });
    return false;
  }
  if (recibido !== esperado) {
    res.status(401).json({ ok: false, error: 'token no valido' });
    return false;
  }
  return true;
}

// Respuesta de error homogenea.
export function fail(res, e) {
  res.status(500).json({ ok: false, error: String((e && e.message) || e) });
}
