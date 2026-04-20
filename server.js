/**
 * CAP — Consultoría Adaptativa Pymes
 * Backend Express con base de datos persistente (JSON con escritura atómica).
 *
 * Endpoints:
 *   GET  /                 → web estática (public/index.html)
 *   POST /api/contact      → crea un nuevo contacto
 *   GET  /api/contacts     → JSON con los contactos (protegido por token)
 *   GET  /admin            → panel HTML con los contactos (protegido por token)
 *   GET  /api/health       → health check
 *
 * Variables de entorno:
 *   PORT           (por defecto 3000)
 *   ADMIN_TOKEN    (por defecto 'cap-admin-2026' — CÁMBIALO en producción)
 *
 * La BD se guarda en data/contacts.json. Cada escritura es atómica
 * (archivo temporal + rename), así nunca se corrompe si el proceso
 * muere a medio escribir.
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// ===== Config =====
const PORT = process.env.PORT || 3000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'cap-admin-2026';
const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'contacts.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

// ===== Base de datos (JSON persistente con escritura atómica) =====
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function loadDB() {
  try {
    if (!fs.existsSync(DB_PATH)) return { contacts: [], nextId: 1 };
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.contacts)) return { contacts: [], nextId: 1 };
    return { contacts: parsed.contacts, nextId: parsed.nextId || parsed.contacts.length + 1 };
  } catch (err) {
    console.error('[DB] Error leyendo BD, se iniciará vacía:', err.message);
    return { contacts: [], nextId: 1 };
  }
}

const dbState = loadDB();

// Cola de escritura para evitar escrituras concurrentes
let writePromise = Promise.resolve();
function persistDB() {
  writePromise = writePromise.then(() => new Promise((resolve) => {
    const tmp = DB_PATH + '.' + crypto.randomBytes(6).toString('hex') + '.tmp';
    const payload = JSON.stringify({ contacts: dbState.contacts, nextId: dbState.nextId }, null, 2);
    fs.writeFile(tmp, payload, (err) => {
      if (err) { console.error('[DB] write tmp error:', err); return resolve(); }
      fs.rename(tmp, DB_PATH, (err2) => {
        if (err2) console.error('[DB] rename error:', err2);
        resolve();
      });
    });
  }));
  return writePromise;
}

function insertContact(entry) {
  const record = {
    id: dbState.nextId++,
    created_at: new Date().toISOString(),
    ...entry,
  };
  dbState.contacts.push(record);
  persistDB();
  return record;
}

function listContacts(limit = 500) {
  return [...dbState.contacts].sort((a, b) => b.id - a.id).slice(0, limit);
}

function countContacts() { return dbState.contacts.length; }

// ===== App =====
const app = express();
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));
app.set('trust proxy', true);

// Rate-limit simple en memoria
const rateMap = new Map();
function rateLimit(ip, max = 5, windowMs = 60_000) {
  const now = Date.now();
  const entry = rateMap.get(ip) || { count: 0, reset: now + windowMs };
  if (now > entry.reset) { entry.count = 0; entry.reset = now + windowMs; }
  entry.count += 1;
  rateMap.set(ip, entry);
  return entry.count <= max;
}

// Helpers
function isValidEmail(s) {
  return typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
}
function sanitize(str, maxLen = 2000) {
  if (typeof str !== 'string') return '';
  return str.trim().slice(0, maxLen);
}
function requireToken(req, res, next) {
  const token = req.query.token || req.headers['x-admin-token'];
  if (token !== ADMIN_TOKEN) {
    return res.status(401).send('No autorizado. Añade ?token=TU_TOKEN a la URL.');
  }
  next();
}

// ===== Estáticos =====
app.use(express.static(PUBLIC_DIR, { maxAge: '1h', etag: true }));

// ===== API: crear contacto =====
app.post('/api/contact', (req, res) => {
  try {
    const ip = (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim();
    if (!rateLimit(ip)) {
      return res.status(429).json({ ok: false, error: 'Demasiadas peticiones. Inténtalo en un minuto.' });
    }

    const body = req.body || {};
    // Honeypot: si un bot rellena "website", se acepta silenciosamente y se descarta.
    if (body.website) return res.json({ ok: true });

    const name    = sanitize(body.name, 120);
    const company = sanitize(body.company, 160);
    const email   = sanitize(body.email, 200);
    const message = sanitize(body.message, 3000);

    if (!name)                return res.status(400).json({ ok: false, error: 'El nombre es obligatorio.' });
    if (!isValidEmail(email)) return res.status(400).json({ ok: false, error: 'Email no válido.' });

    const ua = sanitize(req.headers['user-agent'] || '', 300);
    const record = insertContact({ name, company, email, message, ip, user_agent: ua });

    console.log(`[CONTACT #${record.id}] ${name} <${email}> — ${company || 'sin empresa'}`);
    return res.json({ ok: true, id: record.id });
  } catch (err) {
    console.error('POST /api/contact error:', err);
    return res.status(500).json({ ok: false, error: 'Error interno del servidor.' });
  }
});

// ===== API: listar contactos =====
app.get('/api/contacts', requireToken, (req, res) => {
  res.json({ ok: true, total: countContacts(), contacts: listContacts() });
});

// ===== Admin: panel HTML =====
app.get('/admin', requireToken, (req, res) => {
  const total = countContacts();
  const rows = listContacts();

  const escape = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
  const fmtDate = (iso) => {
    try {
      const d = new Date(iso);
      return d.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
    } catch { return iso; }
  };

  const rowsHtml = rows.map(r => `
    <tr>
      <td class="id">#${r.id}</td>
      <td class="date">${escape(fmtDate(r.created_at))}</td>
      <td><strong>${escape(r.name)}</strong></td>
      <td>${escape(r.company || '—')}</td>
      <td><a href="mailto:${escape(r.email)}">${escape(r.email)}</a></td>
      <td class="msg">${escape(r.message || '').slice(0, 280) || '<span class="muted">—</span>'}</td>
    </tr>`).join('') || `<tr><td colspan="6" class="empty">Aún no hay contactos. Los mensajes enviados desde el formulario aparecerán aquí.</td></tr>`;

  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8">
<title>CAP · Admin · Contactos</title>
<meta name="robots" content="noindex,nofollow">
<style>
  :root { --blue:#1E0FB5; --blue-soft:#EEEBFF; --ink:#0E0E1A; --ink-60:#4A4A5C; --line:#E6E4F0; --bg:#F9F8FD; }
  * { box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; background: var(--bg); color: var(--ink); margin: 0; padding: 40px 24px; }
  .wrap { max-width: 1200px; margin: 0 auto; }
  header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 28px; gap: 16px; flex-wrap: wrap; }
  .title { display: flex; align-items: center; gap: 14px; }
  .title img { width: 36px; height: 36px; border-radius: 6px; }
  h1 { margin: 0; font-size: 1.4rem; color: var(--blue); }
  .count { background: var(--blue); color: white; padding: 6px 16px; border-radius: 100px; font-size: 0.88rem; font-weight: 600; }
  .card { background: white; border: 1px solid var(--line); border-radius: 14px; overflow: hidden; box-shadow: 0 4px 20px rgba(20,10,133,.06); }
  table { width: 100%; border-collapse: collapse; font-size: 0.92rem; }
  th, td { padding: 14px 16px; text-align: left; border-bottom: 1px solid var(--line); vertical-align: top; }
  th { background: var(--blue-soft); font-weight: 600; color: var(--blue); font-size: 0.76rem; text-transform: uppercase; letter-spacing: 0.08em; }
  tbody tr:last-child td { border-bottom: none; }
  tbody tr:hover { background: #FAFAFF; }
  td.id { font-family: 'SF Mono', Consolas, monospace; color: var(--ink-60); font-size: 0.82rem; }
  td.date { color: var(--ink-60); font-size: 0.86rem; white-space: nowrap; }
  td.msg { color: var(--ink-60); max-width: 380px; }
  .empty { text-align: center; color: #8989A0; padding: 48px; font-style: italic; }
  .muted { color: #bbb; }
  a { color: var(--blue); text-decoration: none; } a:hover { text-decoration: underline; }
  .note { margin-top: 24px; font-size: 0.82rem; color: #6b6b7c; }
</style></head>
<body><div class="wrap">
  <header>
    <div class="title">
      <img src="/images/logo.png" alt="CAP">
      <h1>Contactos recibidos</h1>
    </div>
    <span class="count">${total} contacto${total === 1 ? '' : 's'}</span>
  </header>
  <div class="card">
    <table>
      <thead><tr>
        <th>ID</th><th>Fecha</th><th>Nombre</th><th>Empresa</th><th>Email</th><th>Mensaje</th>
      </tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  </div>
  <p class="note">Mostrando los últimos ${Math.min(total, 500)} contactos · Datos persistidos en <code>data/contacts.json</code> · También disponible en JSON en <a href="/api/contacts?token=${encodeURIComponent(ADMIN_TOKEN)}">/api/contacts</a></p>
</div></body></html>`);
});

// ===== Health =====
app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'CAP', total_contacts: countContacts() });
});

// ===== 404 =====
app.use((req, res) => res.status(404).send('Página no encontrada.'));

// ===== Arranque =====
app.listen(PORT, () => {
  console.log(`\n  🚀 CAP server escuchando`);
  console.log(`  → Web:    http://localhost:${PORT}`);
  console.log(`  → Admin:  http://localhost:${PORT}/admin?token=${ADMIN_TOKEN}`);
  console.log(`  → BD:     ${DB_PATH}`);
  console.log(`  → Contactos actuales: ${countContacts()}\n`);
});
