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
  night:   ["nocturno","noche","nit","bar","discoteca","club","cocktail","pub","after","festa","party","nightclub","boite","copa","karaoke","flaming","brunch nocturn"],
  show:    ["show","espectacle","espectaculo","actuaci","performance","magic","magia","circus","circ","cabaret","comedy","monolog","stand up","ilusionist","humorist","drag","burlesc","varietes","escenari","live","en vivo","en directo"]
};

function inferCategory(record) {
  const text = ((record.name || '') + ' ' + (record.body || '')).toLowerCase();
  const debugMatches = {};
  
  for (const [catId, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    const matched = keywords.filter(kw => {
      const regex = new RegExp(`\\b${kw}\\b`, 'i');
      return regex.test(text);
    });
    if (matched.length > 0) {
      debugMatches[catId] = matched;
      const debugMsg = `[CATEG] "${(record.name || '').substring(0, 40)}" → ${catId} [${matched.join(', ')}]`;
      logToFile(debugMsg);
      return catId;
    }
  }
  
  const debugMsg = `[CATEG] "${(record.name || '').substring(0, 40)}" → other (sin coincidencias)`;
  logToFile(debugMsg);
  return 'other';
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

// Duraciones estimadas por categoría (para eventos sin end_time)
const CATEGORY_DURATIONS = {
  sport:   180, // 3h
  music:   180, // 3h
  culture: 240, // 4h
  food:    180, // 3h
  nature:  240, // 4h
  night:   300, // 5h
  family:  240, // 4h
};

/**
 * Filtra eventos pasados de una lista.
 * Actúa sobre eventos de hoy y de ayer (para eventos nocturnos que cruzan medianoche).
 */
function filterPastEvents(events, today, currentTimeMinutes) {
  // Calcular fecha de ayer
  const todayObj = new Date(today + 'T12:00:00');
  const yesterdayObj = new Date(todayObj); yesterdayObj.setDate(yesterdayObj.getDate() - 1);
  const yesterday = yesterdayObj.toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });

  return events.filter(event => {
    const eventDate = (event.start_date || '').substring(0, 10);

    // Eventos de ayer: solo mostrar si aún están en curso (cruzaron medianoche)
    if (eventDate === yesterday) {
      if (!event.start_time) return false;
      const match = event.start_time.match(/^(\d{1,2}):(\d{2})/);
      if (!match) return false;
      const eventStartMinutes = parseInt(match[1]) * 60 + parseInt(match[2]);
      const duration = CATEGORY_DURATIONS[event.category] || 180;
      const endMinutes = eventStartMinutes + duration;
      if (endMinutes <= 1440) return false; // terminó antes de medianoche → descartar
      return currentTimeMinutes < (endMinutes - 1440); // aún en curso en el nuevo día
    }

    if (eventDate !== today) return true; // Días futuros → mantener

    if (!event.start_time) return true; // Sin hora → mantener (no podemos saber si pasó)

    const match = event.start_time.match(/^(\d{1,2}):(\d{2})/);
    if (!match) return true;
    const eventStartMinutes = parseInt(match[1]) * 60 + parseInt(match[2]);

    // Evento futuro → mostrar
    if (eventStartMinutes > currentTimeMinutes) return true;

    // Evento iniciado → comprobar si sigue en progreso
    if (event.end_time) {
      const endMatch = event.end_time.match(/^(\d{1,2}):(\d{2})/);
      if (endMatch) {
        let endMinutes = parseInt(endMatch[1]) * 60 + parseInt(endMatch[2]);
        if (endMinutes < eventStartMinutes) endMinutes += 1440; // cruza medianoche
        return currentTimeMinutes < endMinutes;
      }
    }

    // Sin end_time: usar duración estimada por categoría
    const duration = CATEGORY_DURATIONS[event.category] || 180;
    return currentTimeMinutes < eventStartMinutes + duration;
  });
}

async function fetchBarcelonaEvents(startDate, endDate, currentTime) {
  // Usar siempre la hora y fecha reales de Barcelona (Europe/Madrid), ignorando el parámetro
  // currentTime del frontend que viene en UTC y provoca un desfase de hasta 2h en verano.
  const now = new Date();
  const today = now.toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' }); // YYYY-MM-DD
  const bcnTimeStr = now.toLocaleTimeString('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hour12: false });
  const bcnMatch = bcnTimeStr.match(/(\d{1,2}):(\d{2})/);
  const currentTimeMinutes = bcnMatch ? parseInt(bcnMatch[1]) * 60 + parseInt(bcnMatch[2]) : now.getHours() * 60 + now.getMinutes();

  const fromDate = startDate || today;
  const toDate = endDate || (() => {
    const d = new Date(); d.setDate(d.getDate() + 10); return d.toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
  })();

  let mainEvents = [];
  const t0 = Date.now();
  try {
    // Permitir filtro por categoría
    const categoryFilter = (typeof currentTime === 'object' && currentTime.category) ? `AND category = '${currentTime.category}'` : '';
    const WHERE_BASE = `name NOT ILIKE '%taller%' AND name NOT ILIKE '%curs%' AND name NOT ILIKE '%workshop%' AND name NOT ILIKE '%seminari%' AND name NOT ILIKE '%itinerar%' AND (secondary_filters_fullpath IS NULL OR (secondary_filters_fullpath NOT ILIKE '%taller%' AND secondary_filters_fullpath NOT ILIKE '%curs%')) ${categoryFilter}`;

    // Función auxiliar: normaliza un record crudo de OpenData
    const mapRecord = (rec) => {
      const lat = rec.geo_epgs_4326_lat;
      const lon = rec.geo_epgs_4326_lon;
      const latlon = (lat && lon) ? `${lat},${lon}` : '';
      const streetParts = [rec.addresses_road_name, rec.addresses_start_street_number].filter(Boolean);
      const direccion = streetParts.length > 0
        ? `${streetParts.join(', ')}, ${rec.addresses_district_name || rec.addresses_town || 'Barcelona'}`
        : (rec.addresses_district_name || '');
      const tsTime = rec.start_date && rec.start_date.includes('T')
        ? rec.start_date.split('T')[1].substring(0, 5)
        : '';
      const tsHour = tsTime ? parseInt(tsTime.split(':')[0], 10) : -1;
      const timetableRaw = (rec.timetable || '').trim();
      const timetableTimeMatch = timetableRaw.match(/^(\d{1,2}:\d{2})/);
      const timetableTime = timetableTimeMatch ? timetableTimeMatch[1] : '';
      const timetableText = timetableRaw && !timetableTimeMatch ? timetableRaw : '';
      const startTime = timetableTime || (tsHour >= 7 ? tsTime : '');
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
        category: inferCategory(rec) || 'other',
        origen: 'opendata-ajuntament',
        direccion
      }, 'opendata-ajuntament');
    };

    // Función auxiliar: ejecuta un SQL y devuelve records normalizados con reintentos
    const queryOpenData = async (sql, maxRetries = 3) => {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const res = await axios.get(
            'https://opendata-ajuntament.barcelona.cat/data/api/action/datastore_search_sql',
            { params: { sql }, timeout: 10000 }
          );
          if (res.data && res.data.result && res.data.result.records) {
            if (attempt > 1) {
              logToFile(`[INFO] opendata-ajuntament: éxito en intento ${attempt}`);
            }
            return res.data.result.records.map(mapRecord);
          }
          return [];
        } catch (err) {
          if (attempt < maxRetries) {
            const delayMs = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s
            logToFile(`[WARN] opendata-ajuntament: intento ${attempt} falló, reintentando en ${delayMs}ms...`);
            await new Promise(r => setTimeout(r, delayMs));
          } else {
            logToFile(`[WARN] opendata-ajuntament: error después de ${maxRetries} intentos: ${err.message}`);
            throw err;
          }
        }
      }
      return [];
    };

    // Si la búsqueda empieza hoy: dos queries en paralelo para que los eventos
    // de días futuros tengan su propio cupo y no sean desplazados por los de hoy.
    if (fromDate === today) {
      const tOpenDataStart = Date.now();
      const tomorrow = (() => {
        const d = new Date(today); d.setDate(d.getDate() + 1);
        return d.toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
      })();

      // Calcular ayer para capturar eventos nocturnos que cruzan medianoche
      const yesterdayForQuery = (() => {
        const d = new Date(today + 'T12:00:00'); d.setDate(d.getDate() - 1);
        return d.toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
      })();
      // Solo buscar eventos de ayer si estamos antes de las 6am (posibles nocturnos aún en curso)
      const sqlYesterday = currentTimeMinutes < 360
        ? `SELECT * FROM "877ccf66-9106-4ae2-be51-95a9f6469e4c" WHERE ${WHERE_BASE} AND start_date >= '${yesterdayForQuery}T18:00:00' AND start_date <= '${yesterdayForQuery}T23:59:59' ORDER BY start_date ASC LIMIT 50`
        : null;
      const sqlToday  = `SELECT * FROM "877ccf66-9106-4ae2-be51-95a9f6469e4c" WHERE ${WHERE_BASE} AND (end_date IS NULL OR end_date >= '${today}T00:00:00') AND start_date >= '${today}T00:00:00' AND start_date <= '${today}T23:59:59' ORDER BY start_date ASC LIMIT 150`;
      const sqlFuture = toDate >= tomorrow
        ? `SELECT * FROM "877ccf66-9106-4ae2-be51-95a9f6469e4c" WHERE ${WHERE_BASE} AND (end_date IS NULL OR end_date >= '${tomorrow}T00:00:00') AND start_date >= '${tomorrow}T00:00:00' AND start_date <= '${toDate}T23:59:59' ORDER BY start_date ASC LIMIT 100`
        : null;

      const [yesterdayEvents, todayEvents, futureEvents] = await Promise.all([
        sqlYesterday ? queryOpenData(sqlYesterday) : Promise.resolve([]),
        queryOpenData(sqlToday),
        sqlFuture ? queryOpenData(sqlFuture) : Promise.resolve([])
      ]);
      mainEvents = [...yesterdayEvents, ...todayEvents, ...futureEvents];
      const tOpenDataEnd = Date.now();
      logToFile(`[INFO] opendata split query: ayer=${yesterdayEvents.length}, hoy=${todayEvents.length}, futuros=${futureEvents.length}, tiempo=${tOpenDataEnd-tOpenDataStart}ms`);
    } else {
      // Búsqueda enteramente en el futuro: un solo query
      const sql = `SELECT * FROM "877ccf66-9106-4ae2-be51-95a9f6469e4c" WHERE ${WHERE_BASE} AND (end_date IS NULL OR end_date >= '${fromDate}T00:00:00') AND start_date >= '${fromDate}T00:00:00' AND start_date <= '${toDate}T23:59:59' ORDER BY start_date ASC LIMIT 150`;
      const tOpenDataStart = Date.now();
      mainEvents = await queryOpenData(sql);
      const tOpenDataEnd = Date.now();
      logToFile(`[INFO] opendata query tiempo=${tOpenDataEnd-tOpenDataStart}ms`);
    }

    if (mainEvents.length > 0) {
      // Filtrar actividades de larga duración (>3 días = exposiciones, ciclos, cursos disfrazados)
      mainEvents = mainEvents.filter(ev => {
        if (!ev.end_date || !ev.start_date) return true;
        const start = new Date(ev.start_date);
        const end = new Date(ev.end_date);
        const diffDays = (end - start) / (1000 * 60 * 60 * 24);
        return diffDays <= 3;
      });

      // Enriquecer con hora real y lugar desde guia.barcelona.cat ANTES de filtrar,
      // para que eventos sin start_time en OpenData tengan hora al filtrar.
      try {
        mainEvents = await enrichWithGuiaBCN(mainEvents, { concurrency: 10, maxEvents: 90 });
        logToFile(`[INFO] guia.barcelona.cat scraping completado para ${Math.min(mainEvents.length, 90)} eventos`);
      } catch (scrapeErr) {
        logToFile(`[WARN] guia.barcelona.cat scraping error: ${scrapeErr.message}`);
      }

      // Filtrar eventos pasados usando la hora real de Barcelona (post-enriquecimiento)
      mainEvents = filterPastEvents(mainEvents, today, currentTimeMinutes);

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

  // Permitir pasar filtros a Ticketmaster
  let ticketmasterOpts = {};
  if (typeof currentTime === 'object') {
    if (currentTime.lat && currentTime.lon) {
      ticketmasterOpts.lat = currentTime.lat;
      ticketmasterOpts.lon = currentTime.lon;
    }
    if (currentTime.radius) ticketmasterOpts.radius = currentTime.radius;
    if (currentTime.category) ticketmasterOpts.category = currentTime.category;
  }
  const tTicketmasterStart = Date.now();
  const ticketmasterPromise = fetchTicketmasterEvents(fromDate, toDate, ticketmasterOpts);
  const alleventsPromise = fetchAllEventsIn();
  const [ticketmasterEvents, allevents] = await Promise.all([
    ticketmasterPromise,
    alleventsPromise
  ]);
  const tTicketmasterEnd = Date.now();
  logToFile(`[INFO] ticketmaster tiempo=${tTicketmasterEnd-tTicketmasterStart}ms`);

  let msg = `[INFO] ticketmaster: ${ticketmasterEvents.length} eventos obtenidos`;
  console.log(msg); logToFile(msg);
  const tAllEventsEnd = Date.now();
  msg = `[INFO] allevents: ${allevents.length} eventos obtenidos, tiempo total backend=${tAllEventsEnd-t0}ms`;
  console.log(msg); logToFile(msg);

  if (ticketmasterEvents.length === 0) { msg = '[WARN] ticketmaster: sin eventos (¿TICKETMASTER_API_KEY en .env?)'; console.warn(msg); logToFile(msg); }
  if (allevents.length === 0) { msg = '[WARN] allevents: sin eventos'; console.warn(msg); logToFile(msg); }

  // Normalizar eventos de otras fuentes
  const normalizedTicketmaster = (ticketmasterEvents || []).map(ev => {
    const normalized = normalizeActivity(ev, 'ticketmaster');
    normalized.category = inferCategory(normalized) || 'other';
    return normalized;
  });
  const normalizedAllEvents = (allevents || []).map(ev => {
    const normalized = normalizeActivity(ev, 'allevents');
    normalized.category = inferCategory(normalized) || 'other';
    return normalized;
  });

  // Filtrar eventos pasados en otras fuentes también
  const filteredTicketmaster = filterPastEvents(normalizedTicketmaster, today, currentTimeMinutes);
  const filteredAllEvents = filterPastEvents(normalizedAllEvents, today, currentTimeMinutes);

  // Filtrar por radio después de obtener todos los eventos (si se pasa lat/lon/radius)
  let allEvents = [
    ...mainEvents,
    ...filteredTicketmaster,
    ...filteredAllEvents
  ];
  if (typeof currentTime === 'object' && currentTime.lat && currentTime.lon && currentTime.radius) {
    const { lat, lon, radius } = currentTime;
    // Haversine
    function haversine(lat1, lon1, lat2, lon2) {
      const R = 6371;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    }
    allEvents = allEvents.filter(ev => {
      if (!ev.geo_epgs_4326_latlon) return false;
      const parts = ev.geo_epgs_4326_latlon.split(',').map(Number);
      if (parts.length !== 2 || isNaN(parts[0]) || isNaN(parts[1])) return false;
      const dist = haversine(lat, lon, parts[0], parts[1]);
      return dist <= radius;
    });
  }

  logToFile(`[INFO] Pre-dedup: opendata=${mainEvents.length}, ticketmaster=${filteredTicketmaster.length}, allevents=${filteredAllEvents.length}, total=${allEvents.length}`);

  // Dedupe
  const { deduplicateActivities } = require('./dedupe');
  const dedupedEvents = deduplicateActivities(allEvents);

  logToFile(`[INFO] Post-dedup: ${dedupedEvents.length} eventos (perdidos ${allEvents.length - dedupedEvents.length} por dedupe)`);

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

module.exports = { fetchBarcelonaEvents, CATEGORY_KEYWORDS };