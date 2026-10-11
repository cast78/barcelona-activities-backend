const crypto = require('crypto');
const express = require('express');
const { getCurrentRaw, replaceScope } = require('./recommendations');
const { SCOPES, ValidationError, normalizeBatch } = require('./adminRecommendations');

const router = express.Router();

const MAX_FAILURES = 10;
const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const failures = new Map(); // ip -> { count, resetAt }

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function registerFailure(ip) {
  const now = Date.now();
  if (failures.size > 1000) {
    for (const [key, rec] of failures) if (rec.resetAt <= now) failures.delete(key);
  }
  const rec = failures.get(ip);
  if (!rec || rec.resetAt <= now) failures.set(ip, { count: 1, resetAt: now + FAILURE_WINDOW_MS });
  else rec.count += 1;
}

function adminAuth(req, res, next) {
  res.set('Cache-Control', 'no-store');
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) return res.status(503).json({ error: 'Panel admin deshabilitado' });

  const rec = failures.get(req.ip);
  if (rec && rec.resetAt > Date.now() && rec.count >= MAX_FAILURES) {
    return res.status(429).json({ error: 'Demasiados intentos. Inténtalo más tarde.' });
  }

  const match = (req.get('authorization') || '').match(/^Bearer (.+)$/i);
  if (!match || !safeEqual(match[1], expected)) {
    registerFailure(req.ip);
    return res.status(401).json({ error: 'No autorizado' });
  }
  failures.delete(req.ip);
  next();
}

const wrap = (fn) => (req, res) => fn(req, res).catch((err) => {
  if (err instanceof ValidationError) return res.status(400).json({ error: err.message });
  console.error(`[ERROR] admin ${req.method} ${req.path}: ${err.message}`);
  res.status(502).json({ error: 'No se pudo acceder al Gist de recomendaciones' });
});

function scopeSummary(raw) {
  const scopes = {};
  for (const scope of SCOPES) {
    const s = (raw.scopes && raw.scopes[scope]) || {};
    const activities = Array.isArray(s.activities) ? s.activities : [];
    scopes[scope] = { updated_at: s.updated_at || null, count: activities.length, activities };
  }
  return scopes;
}

router.use(adminAuth);
router.use(express.json({ limit: '1mb' }));

router.get('/session', (req, res) => res.json({ ok: true }));

router.get('/recommendations', wrap(async (req, res) => {
  const raw = await getCurrentRaw();
  res.json({
    version: raw.version || 1,
    updated_at: raw.updated_at || null,
    scopes: scopeSummary(raw),
    plans: Array.isArray(raw.plans) ? raw.plans.length : 0,
  });
}));

router.post('/recommendations/preview', wrap(async (req, res) => {
  const { scope, activities } = req.body || {};
  const entries = normalizeBatch(scope, activities);
  const raw = await getCurrentRaw();
  const current = scopeSummary(raw)[scope];
  res.json({
    scope,
    total: entries.length,
    valid: entries.filter(e => e.ok).length,
    invalid: entries.filter(e => !e.ok).length,
    replaces: current.count,
    entries,
  });
}));

router.post('/recommendations/publish', wrap(async (req, res) => {
  const { scope, activities } = req.body || {};
  const entries = normalizeBatch(scope, activities);
  if (entries.some(e => !e.ok)) {
    return res.status(400).json({ error: 'Hay entradas con errores; corrígelas antes de publicar', entries });
  }
  const previous = scopeSummary(await getCurrentRaw())[scope].count;
  await replaceScope(scope, entries.map(e => e.activity));
  console.log(`[INFO] admin: publicado ámbito "${scope}" (${entries.length} actividades, sustituye ${previous})`);
  res.json({ scope, published: entries.length, replaced: previous });
}));

router.use((err, req, res, next) => {
  const status = err.status && err.status < 500 ? err.status : 500;
  res.status(status).json({ error: status === 413 ? 'Cuerpo demasiado grande' : status < 500 ? 'Petición inválida' : 'Error interno' });
});

module.exports = router;
