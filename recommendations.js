const fs = require('fs').promises;
const path = require('path');

const RECOMMENDATIONS_FILE = path.join(__dirname, 'recommendations.json');

// Devuelve la agenda GoOnMap con los stops de cada plan resueltos a actividades completas.
async function getRecommendations() {
  try {
    const data = await fs.readFile(RECOMMENDATIONS_FILE, 'utf8');
    const parsed = JSON.parse(data);
    const activities = Array.isArray(parsed.activities) ? parsed.activities : [];
    const plans = Array.isArray(parsed.plans) ? parsed.plans : [];

    const byId = Object.fromEntries(activities.map(a => [a.id, a]));

    const resolvedPlans = plans.map(plan => ({
      ...plan,
      activities: (plan.stops || [])
        .map(stop => {
          const activity = byId[stop.activityId];
          if (!activity) return null;
          return { ...activity, suggestedTime: stop.suggestedTime, note: stop.note };
        })
        .filter(Boolean),
    }));

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
