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



const { fetchTicketmasterEvents, fetchAllEventsIn } = require('./externalSources');
const { normalizeActivity } = require('./normalize');
const { enrichWithGuiaBCN } = require('./scrapeGuiaBcn');

async function fetchBarcelonaEvents(startDate, endDate) {
  const today = new Date().toISOString().split('T')[0];
  const fromDate = startDate || today;
  const toDate = endDate || (() => {
    const d = new Date(); d.setDate(d.getDate() + 10); return d.toISOString().split('T')[0];
  })();

  let mainEvents = [];
  try {
    const sql = `SELECT * FROM "877ccf66-9106-4ae2-be51-95a9f6469e4c" WHERE name NOT ILIKE '%taller%' AND name NOT ILIKE '%curs%' AND name NOT ILIKE '%workshop%' AND name NOT ILIKE '%seminari%' AND name NOT ILIKE '%itinerar%' AND (secondary_filters_fullpath IS NULL OR (secondary_filters_fullpath NOT ILIKE '%taller%' AND secondary_filters_fullpath NOT ILIKE '%curs%')) AND (end_date IS NULL OR end_date >= '${fromDate}T00:00:00') AND start_date >= '${fromDate}T00:00:00' AND start_date <= '${toDate}T23:59:59' ORDER BY start_date ASC LIMIT 100`;
    const response = await axios.get(
      'https://opendata-ajuntament.barcelona.cat/data/api/action/datastore_search_sql',
      { params: { sql }, timeout: 10000 }
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
        // Extraer hora del timestamp: solo si es una hora razonable (>=07:00)
        // T03:00:00 es artefacto UTC del dataset opendata (no es hora real del evento)
        const tsTime = rec.start_date && rec.start_date.includes('T')
          ? rec.start_date.split('T')[1].substring(0, 5)
          : '';
        const tsHour = tsTime ? parseInt(tsTime.split(':')[0], 10) : -1;
        // timetable: si empieza con HH:MM úsalo como hora; si es texto libre va al body
        const timetableRaw = (rec.timetable || '').trim();
        const timetableTimeMatch = timetableRaw.match(/^(\d{1,2}:\d{2})/);
        const timetableTime = timetableTimeMatch ? timetableTimeMatch[1] : '';
        const timetableText = timetableRaw && !timetableTimeMatch ? timetableRaw : '';
        const startTime = timetableTime || (tsHour >= 7 ? tsTime : '');
        // Construir descripción con lo disponible
        const bodyParts = [
          rec.values_description || '',
          timetableText,
          rec.institution_name ? `Organitza: ${rec.institution_name}` : '',
          rec.secondary_filters_name ? `Àmbit: ${rec.secondary_filters_name}` : ''
        ].map(s => s.trim()).filter(Boolean);
        return normalizeActivity({
          ...rec,
          id: (rec.register_id || String(rec._id) || '').replace(/^\uFEFF/, ''),
          body: bodyParts.join(' · ') || '',
          start_time: startTime,
          geo_epgs_4326_latlon: latlon,
          category: rec.category || inferCategory(rec),
          origen: 'opendata-ajuntament',
          direccion
        }, 'opendata-ajuntament');
      });
      // Filtrar actividades de larga duración (>3 días = exposiciones, ciclos, cursos disfrazados)
      mainEvents = mainEvents.filter(ev => {
        if (!ev.end_date || !ev.start_date) return true;
        const start = new Date(ev.start_date);
        const end = new Date(ev.end_date);
        const diffDays = (end - start) / (1000 * 60 * 60 * 24);
        return diffDays <= 3;
      });

      // Enriquecer con hora real y lugar desde guia.barcelona.cat
      try {
        mainEvents = await enrichWithGuiaBCN(mainEvents, { concurrency: 10, maxEvents: 90 });
        logToFile(`[INFO] guia.barcelona.cat scraping completado para ${Math.min(mainEvents.length, 90)} eventos`);
      } catch (scrapeErr) {
        logToFile(`[WARN] guia.barcelona.cat scraping error: ${scrapeErr.message}`);
      }

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

  const [ticketmasterEvents, allevents] = await Promise.all([
    fetchTicketmasterEvents(fromDate, toDate),
    fetchAllEventsIn()
  ]);

  let msg = `[INFO] ticketmaster: ${ticketmasterEvents.length} eventos obtenidos`;
  console.log(msg); logToFile(msg);
  msg = `[INFO] allevents: ${allevents.length} eventos obtenidos`;
  console.log(msg); logToFile(msg);

  if (ticketmasterEvents.length === 0) { msg = '[WARN] ticketmaster: sin eventos (¿TICKETMASTER_API_KEY en .env?)'; console.warn(msg); logToFile(msg); }
  if (allevents.length === 0) { msg = '[WARN] allevents: sin eventos'; console.warn(msg); logToFile(msg); }

  // Normalizar eventos de otras fuentes
  const normalizedTicketmaster = (ticketmasterEvents || []).map(ev => {
    const normalized = normalizeActivity(ev, 'ticketmaster');
    normalized.category = ev.category || inferCategory(normalized) || 'other';
    return normalized;
  });
  const normalizedAllEvents = (allevents || []).map(ev => normalizeActivity(ev, 'allevents'));

  // Unir todos los eventos
  const allEvents = [
    ...mainEvents,
    ...normalizedTicketmaster,
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