const crypto = require('crypto');
const { stripHtml } = require('./apiClient');

const SCOPES = ['season', 'week', 'day', 'permanent'];
const CATEGORIES = ['sport', 'culture', 'music', 'family', 'nature', 'night', 'food', 'show', 'other'];
const MAX_BATCH = 200;
const MAX_NAME = 140;
const MAX_BODY = 1500;
const MAX_SHORT = 160;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

class ValidationError extends Error {}

function isValidDate(s) {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !isNaN(d) && d.toISOString().slice(0, 10) === s;
}

// '9:30' / '09:30:00' -> '09:30'; vacío -> ''; inválido -> null
function normalizeTime(v) {
  if (v === undefined || v === null || v === '') return '';
  const m = String(v).trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

function cleanText(v) {
  return typeof v === 'string' ? stripHtml(v).trim() : '';
}

function parseLatLon(v) {
  if (typeof v !== 'string') return null;
  const parts = v.split(',').map(s => s.trim());
  if (parts.length !== 2) return null;
  const lat = Number(parts[0]);
  const lon = Number(parts[1]);
  if (!parts[0] || !parts[1] || !isFinite(lat) || !isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon, text: `${parts[0]},${parts[1]}` };
}

function daysBetween(a, b) {
  return Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000);
}

function madridToday() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
}

// El id es determinista para que volver a subir el mismo evento conserve likes/asistentes.
function generateId(scope, a) {
  const hash = crypto
    .createHash('sha1')
    .update([scope, a.name, a.start_date, a.start_time || ''].join('|'))
    .digest('hex')
    .slice(0, 10);
  return `gom-${scope}-${hash}`;
}

function normalizeEntry(scope, item, today) {
  const errors = [];
  const warnings = [];

  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    return { errors: ['La entrada debe ser un objeto'], warnings, activity: null };
  }

  const name = cleanText(item.name);
  if (!name) errors.push('name es obligatorio');
  else if (name.length > MAX_NAME) errors.push(`name supera ${MAX_NAME} caracteres`);

  let body = cleanText(item.body);
  if (body.length > MAX_BODY) {
    body = body.slice(0, MAX_BODY);
    warnings.push(`body recortado a ${MAX_BODY} caracteres`);
  }

  const geo = parseLatLon(item.geo_epgs_4326_latlon);
  if (!geo) {
    errors.push('geo_epgs_4326_latlon debe tener formato "lat,lon"');
  } else if (geo.lat < 41.2 || geo.lat > 41.6 || geo.lon < 1.9 || geo.lon > 2.4) {
    warnings.push('Las coordenadas quedan fuera del área de Barcelona');
  }

  let category = item.category;
  if (category === undefined || category === null || category === '') {
    category = 'other';
    warnings.push('category vacía: se usará "other"');
  } else if (!CATEGORIES.includes(category)) {
    errors.push(`category "${category}" no válida (${CATEGORIES.join(', ')})`);
  }

  let startDate = item.start_date;
  let endDate = item.end_date;
  if (scope === 'permanent' && !startDate) {
    startDate = today;
    endDate = today;
  }
  if (!isValidDate(startDate)) {
    errors.push('start_date debe tener formato YYYY-MM-DD');
  } else {
    if (!endDate) endDate = startDate;
    if (!isValidDate(endDate)) errors.push('end_date debe tener formato YYYY-MM-DD');
    else if (endDate < startDate) errors.push('end_date es anterior a start_date');
  }

  const startTime = normalizeTime(item.start_time);
  const endTime = normalizeTime(item.end_time);
  if (startTime === null) errors.push('start_time debe tener formato HH:MM');
  if (endTime === null) errors.push('end_time debe tener formato HH:MM');
  if (startTime && endTime && endTime < startTime) warnings.push('end_time anterior a start_time (se tratará como cruce de medianoche)');
  if (endTime && !startTime) warnings.push('end_time sin start_time');

  if (isValidDate(startDate) && isValidDate(endDate) && endDate >= startDate && scope !== 'permanent') {
    if (endDate < today) warnings.push('Ya ha caducado: no se mostrará en la app');
    if (scope === 'day' && endDate !== startDate) warnings.push('Un evento "day" suele ser de un solo día');
    if (scope === 'week' && daysBetween(startDate, endDate) > 7) warnings.push('Un evento "week" abarca más de 7 días');
  }

  let id = item.id;
  if (id !== undefined && id !== null && id !== '') {
    if (typeof id !== 'string' || !ID_RE.test(id)) errors.push('id solo admite letras, números, "-" y "_" (máx. 64)');
  } else {
    id = errors.length === 0 ? generateId(scope, { name, start_date: startDate, start_time: startTime }) : undefined;
  }

  if (errors.length > 0) return { errors, warnings, activity: null };

  const activity = {
    id,
    name,
    body,
    scope,
    start_date: startDate,
    end_date: endDate,
    ...(startTime ? { start_time: startTime } : {}),
    ...(endTime ? { end_time: endTime } : {}),
    ...(cleanText(item.venue_name) ? { venue_name: cleanText(item.venue_name).slice(0, MAX_SHORT) } : {}),
    ...(cleanText(item.direccion) ? { direccion: cleanText(item.direccion).slice(0, MAX_SHORT) } : {}),
    geo_epgs_4326_latlon: geo.text,
    category,
    origen: 'GoOnMap',
    featured: typeof item.featured === 'boolean' ? item.featured : true,
    plan_only: typeof item.plan_only === 'boolean' ? item.plan_only : false,
    ...(scope === 'permanent' ? { recurring: true } : {}),
  };
  return { errors, warnings, activity };
}

// Valida y normaliza un lote; solo se copian campos conocidos (lista blanca).
function normalizeBatch(scope, items) {
  if (!SCOPES.includes(scope)) throw new ValidationError(`scope debe ser uno de: ${SCOPES.join(', ')}`);
  if (!Array.isArray(items)) throw new ValidationError('activities debe ser un array');
  if (items.length > MAX_BATCH) throw new ValidationError(`Máximo ${MAX_BATCH} actividades por lote`);

  const today = madridToday();
  const seen = new Set();
  return items.map((item, index) => {
    const entry = normalizeEntry(scope, item, today);
    if (entry.activity) {
      if (seen.has(entry.activity.id)) {
        entry.errors.push(`id duplicado en el lote (${entry.activity.id})`);
        entry.activity = null;
      } else {
        seen.add(entry.activity.id);
      }
    }
    return { index, ok: entry.errors.length === 0, errors: entry.errors, warnings: entry.warnings, activity: entry.activity };
  });
}

module.exports = { SCOPES, CATEGORIES, MAX_BATCH, ValidationError, normalizeBatch };
