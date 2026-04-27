// Dedupe utility for activities
function deduplicateActivities(events) {
  const seen = new Map();
  const norm = (str) => (str || '').toLowerCase().replace(/\s+/g, ' ').trim();
  return events.filter(ev => {
    // Clave: nombre + fecha inicio + latlon (si hay)
    const key = `${norm(ev.name)}|${ev.start_date}|${ev.geo_epgs_4326_latlon}`;
    if (seen.has(key)) return false;
    seen.set(key, true);
    return true;
  });
}

module.exports = { deduplicateActivities };