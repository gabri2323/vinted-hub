# Vinted · Hub de órdenes (Vercel)

Web mínima que hace de **puente entre los dos PC** del centro de control de
Vinted. El PC *director* deja aquí las **órdenes de publicación** y el
directorio de **cuentas**; el PC *ejecutor* (24 h) las recoge por internet.

Solo transporta texto pequeño (JSON). **Las fotos NO pasan por aquí**: viajan por
el catálogo de OneDrive del programa. Aquí no hay credenciales de Vinted ni de
Dolphin ni cookies: solo ids de perfil, uids de producto y horas.

## Qué es cada cosa

```
api/health.js          GET  comprueba token + base de datos
api/stations.js        POST anunciar cuentas de un PC / GET leerlas todas
api/orders.js          POST crear una orden / GET las 'pendiente' de unos perfiles
api/orders_applied.js  POST marcar una orden como aplicada
lib/db.js              conexión a Neon Postgres + creación del esquema
lib/auth.js            comprobación del token (cabecera x-hub-token)
public/index.html      página de inicio (comprobar el despliegue)
```

Todas las rutas `/api/*` exigen la cabecera `x-hub-token` = variable `HUB_TOKEN`.

## Desplegar en Vercel (resumen)

1. **Sube este código** a tu repositorio de GitHub conectado a Vercel.
   - Si subes la carpeta `hub-vercel/` entera, entra en **Vercel → Project →
     Settings → Build & Deployment → Root Directory** y pon `hub-vercel`.
2. **Base de datos**: Vercel → tu proyecto → pestaña **Storage** → **Create
   Database → Neon (Postgres)** → conéctala al proyecto. Se añade sola la
   variable `DATABASE_URL`.
3. **Token**: Vercel → **Settings → Environment Variables** → añade
   `HUB_TOKEN` con un secreto largo (el mismo que pondrás en los dos PC).
4. **Redeploy** (Deployments → Redeploy). Abre `https://TU-PROYECTO.vercel.app`
   y prueba el token: debe decir *token correcto y base de datos lista*.

## Variables de entorno (en Vercel)

| Variable       | De dónde sale                          | Para qué                    |
|----------------|----------------------------------------|-----------------------------|
| `HUB_TOKEN`    | la escribes tú (secreto compartido)    | proteger la API             |
| `DATABASE_URL` | la pone la integración de Neon/Postgres| guardar cuentas y órdenes   |

El esquema (`estaciones`, `ordenes`) se crea solo en la primera petición.

## Cómo lo usan los PC

En el panel de cada PC → **Ajustes → 🛰️ Hub de órdenes**: la misma URL y el
mismo token. A partir de ahí las órdenes van por aquí en vez de por OneDrive.
El código cliente está en `app/hub.py` del programa principal.
