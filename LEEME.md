# CAP — Consultoría Adaptativa Pymes

Web completa (frontend + backend con base de datos) para CAP.

## Cómo arrancar

Desde esta carpeta (`web_v2`), abre una terminal y ejecuta:

```bash
npm install          # sólo la primera vez (instala Express)
npm start            # arranca el servidor
```

Abre en el navegador:

- **Web pública:** <http://localhost:3000>
- **Panel admin (contactos recibidos):** <http://localhost:3000/admin?token=cap-admin-2026>

## Qué hay dentro

```
web_v2/
├── server.js                   ← backend Express (200 líneas)
├── package.json                ← única dependencia: express
├── public/                     ← frontend estático
│   ├── index.html              ← página web
│   ├── styles.css              ← estilos
│   └── images/                 ← logo y fotos del equipo
│       ├── logo.png
│       ├── team-1.jpeg
│       ├── team-2.jpeg
│       ├── team-3.jpeg
│       └── team-4.jpeg
├── data/
│   └── contacts.json           ← base de datos (se crea al primer envío)
└── LEEME.md                    ← este archivo
```

## Cómo funciona el formulario

El formulario está pensado para que **siempre funcione**.

Modo A — servidor Node arrancado (`arrancar.command` o `npm start`):

1. El navegador hace un `POST /api/contact` con los datos en JSON.
2. El backend valida (nombre, email, anti-spam honeypot, rate-limit por IP).
3. Guarda el contacto en `data/contacts.json` con escritura atómica.
4. Muestra al usuario un mensaje de éxito.

Modo B — `index.html` abierto con doble clic (sin servidor):

1. El formulario detecta `file://` y abre tu cliente de email
   con un mensaje pre-rellenado a `lluismoxo@gmail.com`.
2. Solo tienes que pulsar "Enviar".

Modo C — servidor caído o sin red: se usa el mismo fallback mailto.

## Ver los contactos

Ve al panel admin: <http://localhost:3000/admin?token=cap-admin-2026>

El panel muestra una tabla con ID, fecha, nombre, empresa, email y mensaje.

También tienes la misma información en JSON:
<http://localhost:3000/api/contacts?token=cap-admin-2026>

## Configuración

Puedes cambiar el puerto y el token admin con variables de entorno:

```bash
PORT=8080 ADMIN_TOKEN=mi_token_secreto npm start
```

**Importante para producción:** cambia `ADMIN_TOKEN` por uno largo y aleatorio.

## Protecciones incluidas

- **Rate-limit** por IP: máximo 5 envíos por minuto.
- **Honeypot anti-bot**: campo oculto "website" descartado si se rellena.
- **Validación server-side**: nombre obligatorio, email válido, longitud máxima por campo.
- **Escritura atómica** de la BD (archivo temporal + rename) para no corromper datos.
- **Admin protegido por token** en URL o cabecera `X-Admin-Token`.

## ¿Y si quieres BD más seria más adelante?

El código está preparado para migrar fácilmente a SQLite/PostgreSQL
cuando tengas volumen: las funciones `insertContact`, `listContacts`
y `countContacts` son las únicas que tocan la BD. Cambiar de motor
sólo afecta a esas tres funciones.
