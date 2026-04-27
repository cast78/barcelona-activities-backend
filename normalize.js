// Normalizador de actividades multi-fuente
function normalizeActivity(raw, source) {
  return {
    id: raw.id || raw.register_id || '',
    name: raw.name || '',
    body: raw.body || raw.description || '',
    start_date: raw.start_date || raw.start || '',
    end_date: raw.end_date || raw.end || '',
    geo_epgs_4326_latlon: raw.geo_epgs_4326_latlon || raw.latlon || '',
    category: raw.category || '',
    origen: raw.origen || source || '',
    direccion: raw.direccion || raw.address || raw.venue || ''
  };
}

module.exports = { normalizeActivity };