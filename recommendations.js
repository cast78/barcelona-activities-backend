const fs = require('fs').promises;
const path = require('path');

const RECOMMENDATIONS_FILE = path.join(__dirname, 'recommendations.json');

// Devuelve la agenda GoOnMap con los stops de cada plan resueltos a actividades completas.
async function getRecommendations() {
  try {
    const data = await fs.readFile(RECOMMENDATIONS_FILE, 'utf8');
    const parsed = JSON.parse(data);
    const allActivities = Array.isArray(parsed.activities) ? parsed.activities : [];
    const plans = Array.isArray(parsed.plans) ? parsed.plans : [];

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
      version: parsed.version || 1,
      updated_at: parsed.updated_at || null,
      activities,
      plans: resolvedPlans,
    };
  } catch {
    // Fichero ausente o inválido: sin recomendaciones
    return { version: 1, updated_at: null, activities: [], plans: [] };
  }
}

module.exports = { getRecommendations };
