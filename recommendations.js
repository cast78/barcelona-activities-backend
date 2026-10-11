const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');

const SEED_FILE = path.join(__dirname, 'recommendations.json');
const SCOPES = ['season', 'week', 'day', 'permanent'];
const CACHE_TTL_MS = 60 * 1000;
const GIST_TIMEOUT_MS = 8000;

let cache = null; // { data, fetchedAt }
let inFlight = null;

function gistConfig() {
  const { GITHUB_GIST_ID, GITHUB_GIST_TOKEN } = process.env;
  if (!GITHUB_GIST_ID || !GITHUB_GIST_TOKEN) return null;
  return {
    id: GITHUB_GIST_ID,
    token: GITHUB_GIST_TOKEN,
    filename: process.env.GITHUB_GIST_FILENAME || 'recommendations.json',
  };
}

async function fetchFromGist(cfg) {
  const res = await axios.get(`https://api.github.com/gists/${cfg.id}`, {
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'goonmap-backend',
    },
    timeout: GIST_TIMEOUT_MS,
  });
  const file = res.data && res.data.files && res.data.files[cfg.filename];
  if (!file || typeof file.content !== 'string') {
    throw new Error(`archivo "${cfg.filename}" no encontrado en el gist`);
  }
  return JSON.parse(file.content);
}

// Gist con caché; si falla, última copia buena y, en último término, el fichero semilla del repo.
async function loadRaw() {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return cache.data;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const cfg = gistConfig();
    try {
      if (!cfg) throw new Error('GITHUB_GIST_ID/GITHUB_GIST_TOKEN no configurados');
      const data = await fetchFromGist(cfg);
      cache = { data, fetchedAt: Date.now() };
      return data;
    } catch (err) {
      if (cfg) console.warn(`[WARN] recommendations: gist no disponible (${err.message})`);
      if (cache) return cache.data;
      return JSON.parse(await fs.readFile(SEED_FILE, 'utf8'));
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

// v2 ({ scopes: { season|week|day|permanent: { activities } } }) y v1 ({ activities }).
function flattenActivities(raw) {
  if (raw.scopes && typeof raw.scopes === 'object') {
    return SCOPES.flatMap(scope => {
      const list = raw.scopes[scope] && raw.scopes[scope].activities;
      return (Array.isArray(list) ? list : [])
        .map(a => ({ ...a, scope, ...(scope === 'permanent' ? { recurring: true } : {}) }));
    });
  }
  return Array.isArray(raw.activities) ? raw.activities : [];
}

// Devuelve la agenda GoOnMap con los stops de cada plan resueltos a actividades completas.
async function getRecommendations() {
  try {
    const raw = await loadRaw();
    const allActivities = flattenActivities(raw);
    const plans = Array.isArray(raw.plans) ? raw.plans : [];

    // Hoy en zona horaria de Barcelona (coherente con /api/events)
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });

    // Las recurrentes (museos, parques, mercados…) nunca caducan; las puntuales se ocultan tras su fecha.
    const isCurrentActivity = (a) => {
      if (a.recurring) return true;
      const dateRef = a.end_date || a.start_date;
      if (!dateRef) return true;
      return dateRef >= today;
    };
    const activities = allActivities.filter(isCurrentActivity);

    const byId = Object.fromEntries(activities.map(a => [a.id, a]));

    const resolvedPlans = plans
      // Descartar planes cuya ventana de validez ya terminó
      .filter(plan => !plan.valid_to || plan.valid_to >= today)
      .map(plan => ({
        ...plan,
        activities: (plan.stops || [])
          .map(stop => {
            const activity = byId[stop.activityId];
            if (!activity) return null;
            return { ...activity, suggestedTime: stop.suggestedTime, note: stop.note };
          })
          .filter(Boolean),
      }))
      // Un plan sin paradas vigentes no aporta nada
      .filter(plan => plan.activities.length > 0);

    return {
      version: raw.version || 1,
      updated_at: raw.updated_at || null,
      activities,
      plans: resolvedPlans,
    };
  } catch (err) {
    // Ni Gist ni semilla disponibles: sin recomendaciones
    console.warn(`[WARN] recommendations: ${err.message}`);
    return { version: 1, updated_at: null, activities: [], plans: [] };
  }
}

module.exports = { getRecommendations };
