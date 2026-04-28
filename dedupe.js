// Dedupe utility for activities
function deduplicateActivities(events) {
  const seenIds = new Set();
  const seenKeys = new Map();
  const norm = (str) => (str || '').toLowerCase().replace(/\s+/g, ' ').trim();
  return events.filter(ev => {
    // Primero deduplicar por id si existe
    if (ev.id) {
      if (seenIds.has(ev.id)) return false;
      seenIds.add(ev.id);
    }
    // Luego por nombre + fecha (para cruzar duplicados entre fuentes)
    const key = `${norm(ev.name)}|${ev.start_date}`;
    if (seenKeys.has(key)) return false;
    seenKeys.set(key, true);
    return true;
  });
}

module.exports = { deduplicateActivities };