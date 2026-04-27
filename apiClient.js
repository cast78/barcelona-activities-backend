const fs = require('fs');
const path = require('path');
const LOG_FILE = path.join(__dirname, 'backend.log');
function logToFile(msg) {
  fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${msg}\n`);
}
const axios = require('axios');
const { VALID_CATEGORIES } = require('./models');

// Keywords para inferir categoria automaticamente (mirror del frontend)
const CATEGORY_KEYWORDS = {
  sport:   ["sport","deporte","running","futbol","basket","tennis","nataci","esport","atletis","padel","ciclis","volei","volley"],
  culture: ["cultur","museu","museo","teatr","exposici","art","cine","cinema","patrimoni","literatu","gotic","gothic","visita"],
  music:   ["music","concert","festival","jazz","rock","orquestr","dansa","ball","flamenco"],
  food:    ["gastronom","restaurant","mercat","food","cuina","tast","vi","vermut","mercat"],
  family:  ["famili","familiar","nens","kids","infantil","infants","jovent","escola","casteller"],
  nature:  ["natura","parc","senderis","jardi","medi ambient","ecolog","bosc","platj","mar","guell","tibidabo"],
  night:   ["nocturno","noche","nit","bar","discoteca","club","cocktail","pub","after","festa","party","nightclub","copa","karaoke"]
};

function inferCategory(record) {
  const text = ((record.name || '') + ' ' + (record.body || '')).toLowerCase();
  for (const [catId, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(kw => text.includes(kw))) return catId;
  }
  return null;
}

// ✅ Generar eventos con fechas dinámicas (hoy + 10 días)
function generateMockEvents() {
  const today = new Date();
  const fmt = (d) => d.toISOString().split('T')[0];
  
  const getDate = (daysFromNow) => {
    const d = new Date(today);
    d.setDate(d.getDate() + daysFromNow);
    return fmt(d);
  };

  return [
    { id: 'evt001', name: 'Sagrada Familia Tour',               start_date: getDate(0), end_date: getDate(5), geo_epgs_4326_latlon: '41.4036,2.1744',  body: 'Visita guiada a la Sagrada Familia.',             category: 'culture', origen: 'mock', direccion: 'Carrer de Mallorca, 401, Barcelona' },
    { id: 'evt002', name: 'Park Guell Experience',              start_date: getDate(1), end_date: getDate(7), geo_epgs_4326_latlon: '41.3847,2.1521',  body: 'Explora el parque mas hermoso de Barcelona.',     category: 'nature',  origen: 'mock', direccion: 'Carrer d\'Olot, s/n, Barcelona' },
    { id: 'evt003', name: 'Gothic Quarter Walking Tour',        start_date: getDate(0), end_date: getDate(10), geo_epgs_4326_latlon: '41.3851,2.1734',  body: 'Recorrido por el barrio gotico medieval.',         category: 'culture', origen: 'mock', direccion: 'Barri Gòtic, Barcelona' },
    { id: 'evt004', name: 'Beach Volleyball Tournament',        start_date: getDate(2), end_date: getDate(2), geo_epgs_4326_latlon: '41.3863,2.1841',  body: 'Torneo de voleibol en la playa de Barcelona.',    category: 'sport',   origen: 'mock', direccion: 'Platja de la Barceloneta, Barcelona' },
    { id: 'evt005', name: 'Jazz al Parc de la Ciutadella',      start_date: getDate(1), end_date: getDate(1), geo_epgs_4326_latlon: '41.3862,2.1868',  body: 'Concert de jazz en viu. Entrada lliure.',          category: 'music',   origen: 'mock', direccion: 'Parc de la Ciutadella, Barcelona' },
    { id: 'evt006', name: 'Mercat de Santa Caterina',           start_date: getDate(3), end_date: getDate(3), geo_epgs_4326_latlon: '41.3851,2.1770',  body: 'Tast de productes locals al Mercat de Santa Caterina.', category: 'food',  origen: 'mock', direccion: 'Av. de Francesc Cambó, 16, Barcelona' },
    { id: 'evt007', name: 'Festa Familiar al Tibidabo',         start_date: getDate(5), end_date: getDate(5), geo_epgs_4326_latlon: '41.4216,2.1184',  body: 'Jornada familiar amb activitats per a nens.',     category: 'family',  origen: 'mock', direccion: 'Plaça del Tibidabo, Barcelona' },
    { id: 'evt008', name: 'Nit de Copes al Born',               start_date: getDate(2), end_date: getDate(8), geo_epgs_4326_latlon: '41.3855,2.1824',  body: 'Ruta de cocktails pels bars del barri del Born.', category: 'night',   origen: 'mock', direccion: 'El Born, Barcelona' }
  ];
}



const { fetchMeetupEvents, fetchEventbriteEvents, fetchAllEventsIn } = require('./externalSources');
const { normalizeActivity } = require('./normalize');

async function fetchBarcelonaEvents() {
  let mainEvents = [];
  try {
    const response = await axios.get(
      'https://opendata-ajuntament.barcelona.cat/data/api/action/datastore_search?resource_id=3abb2414-1ee0-446e-9c25-380e938adb73&limit=100',
      { timeout: 10000 }
    );
    if (response.data && response.data.result && response.data.result.records) {
      mainEvents = response.data.result.records.map(rec => {
        const lat = rec.geo_epgs_4326_lat;
        const lon = rec.geo_epgs_4326_lon;
        const latlon = (lat && lon) ? `${lat},${lon}` : '';
        const streetParts = [rec.addresses_road_name, rec.addresses_start_street_number].filter(Boolean);
        const direccion = streetParts.length > 0
          ? `${streetParts.join(', ')}, ${rec.addresses_district_name || rec.addresses_town || 'Barcelona'}`
          : (rec.addresses_district_name || '');
        return normalizeActivity({
          ...rec,
          id: rec.register_id || String(rec._id) || '',
          geo_epgs_4326_latlon: latlon,
          category: rec.category || inferCategory(rec),
          origen: 'opendata-ajuntament',
          direccion
        }, 'opendata-ajuntament');
      });
      const msg = `[INFO] opendata-ajuntament: ${mainEvents.length} eventos obtenidos`;
      console.log(msg);
      logToFile(msg);
    } else {
      const msg = '[WARN] opendata-ajuntament: respuesta sin eventos';
      console.warn(msg);
      logToFile(msg);
    }
  } catch (apiError) {
    const msg = `[WARN] opendata-ajuntament: error ${apiError.message}`;
    console.warn(msg);
    logToFile(msg);
  }

  // Llamar a las otras fuentes en paralelo

  const [meetupEvents, eventbriteEvents, allevents] = await Promise.all([
    fetchMeetupEvents(),
    fetchEventbriteEvents(),
    fetchAllEventsIn()
  ]);


  let msg = `[INFO] meetup: ${meetupEvents.length} eventos obtenidos`;
  console.log(msg); logToFile(msg);
  msg = `[INFO] eventbrite: ${eventbriteEvents.length} eventos obtenidos`;
  console.log(msg); logToFile(msg);
  msg = `[INFO] allevents: ${allevents.length} eventos obtenidos`;
  console.log(msg); logToFile(msg);

  if (meetupEvents.length === 0) { msg = '[WARN] meetup: sin eventos (¿API key?)'; console.warn(msg); logToFile(msg); }
  if (eventbriteEvents.length === 0) { msg = '[WARN] eventbrite: sin eventos (¿API key?)'; console.warn(msg); logToFile(msg); }
  if (allevents.length === 0) { msg = '[WARN] allevents: sin eventos'; console.warn(msg); logToFile(msg); }

  // Normalizar eventos de otras fuentes
  const normalizedMeetup = (meetupEvents || []).map(ev => normalizeActivity(ev, 'meetup'));
  const normalizedEventbrite = (eventbriteEvents || []).map(ev => normalizeActivity(ev, 'eventbrite'));
  const normalizedAllEvents = (allevents || []).map(ev => normalizeActivity(ev, 'allevents'));

  // Unir todos los eventos
  const allEvents = [
    ...mainEvents,
    ...normalizedMeetup,
    ...normalizedEventbrite,
    ...normalizedAllEvents
  ];

  // Dedupe
  const { deduplicateActivities } = require('./dedupe');
  const dedupedEvents = deduplicateActivities(allEvents);

  // Si no hay ningún evento real, usar mock
  if (dedupedEvents.length === 0) {
    const mockMsg = '[WARN] Sin eventos reales. Devolviendo datos mock.';
    console.warn(mockMsg);
    logToFile(mockMsg);
    return generateMockEvents();
  }
  const okMsg = `[INFO] Total eventos reales devueltos: ${dedupedEvents.length}`;
  console.log(okMsg);
  logToFile(okMsg);
  return dedupedEvents;
}

module.exports = { fetchBarcelonaEvents };