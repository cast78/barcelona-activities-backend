// Normalizador de actividades multi-fuente
function normalizeActivity(raw, source) {
  return {
    id: raw.id || raw.register_id || '',
    name: raw.name || '',
    body: raw.body || raw.description || '',
    start_date: raw.start_date || raw.start || null,
    start_time: raw.start_time || '',
    end_date: raw.end_date || raw.end || null,
    geo_epgs_4326_latlon: raw.geo_epgs_4326_latlon || raw.latlon || '',
    category: raw.category || 'other',
    origen: raw.origen || source || '',
    direccion: raw.direccion || raw.address || raw.venue || '',
    venue_name: raw.venue_name || ''
  };
}

module.exports = { normalizeActivity };