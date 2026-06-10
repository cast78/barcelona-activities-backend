const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const { fetchBarcelonaEvents } = require('./apiClient');
const { getActivities, addActivity, getLikes, toggleLike, getAttendees, toggleAttend } = require('./storage');
const { CATEGORY_KEYWORDS } = require('./apiClient');

const app = express();
const PORT = process.env.PORT || 3001;

const ALLOWED_ORIGINS = (process.env.FRONTEND_URL || 'https://barcelona-activities-frontend.vercel.app')
  .split(',')
  .map(o => o.trim())
  .concat(['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002', 'http://localhost:3003', 'http://localhost:3004', 'http://localhost:3005']);

app.use(cors({
  origin: (origin, callback) => {
    // Permitir requests sin origin (ej: curl, Postman) y los origins permitidos
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS blocked: ${origin}`));
    }
  }
}));
app.use(express.json());

// Route to get events from Barcelona API
app.get('/api/events', async (req, res) => {
  try {
    const { startDate, endDate, currentTime, bySource, lat, lon, radius, category } = req.query;
    console.log(`[API] /events request: startDate=${startDate}, endDate=${endDate}, currentTime=${currentTime}, bySource=${bySource}`);

    // Construir objeto de filtros para compatibilidad con frontend
    let filters = { startDate, endDate, currentTime };
    if (lat !== undefined) filters.lat = Number(lat);
    if (lon !== undefined) filters.lon = Number(lon);
    if (radius !== undefined) filters.radius = Number(radius);
    if (category) filters.category = category;


    // Obtener actividades de usuario y marcar origen
    let userActivities = await getActivities();
    userActivities = userActivities.map(a => ({ ...a, origen: 'Usuario City Radar' }));

    // --- FILTRADO DE ACTIVIDADES DE USUARIO ---
    // Filtros: fecha, radio, categoría
    const filterUserActivities = (activities) => {
      // Asegurar que radius es número
      const radiusNum = radius !== undefined ? Number(radius) : undefined;
      return activities.filter(act => {
        // Filtrar por fecha inicio/fin
        if (startDate && act.start_date && act.start_date < startDate) return false;
        if (endDate && act.start_date && act.start_date > endDate) return false;
        // Filtrar por categoría
        if (category && act.category && act.category !== category) return false;
        // Filtrar por radio (si hay lat/lon)
        if (lat !== undefined && lon !== undefined && act.geo_epgs_4326_latlon) {
          const [aLat, aLon] = act.geo_epgs_4326_latlon.split(',').map(Number);
          if (!isNaN(aLat) && !isNaN(aLon)) {
            const R = 6371;
            const dLat = (aLat - Number(lat)) * Math.PI / 180;
            const dLon = (aLon - Number(lon)) * Math.PI / 180;
            const a = Math.sin(dLat / 2) ** 2 + Math.cos(Number(lat) * Math.PI / 180) * Math.cos(aLat * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            const dist = R * c;
            if (radiusNum !== undefined && dist > radiusNum) return false;
          }
        }
        // Filtrar eventos pasados (solo mostrar hoy o futuros)
        const today = new Date().toISOString().split('T')[0];
        if (act.start_date && act.start_date < today) return false;
        return true;
      });
    };
    userActivities = filterUserActivities(userActivities);

    // Si bySource está presente, devolver agrupado por fuente
    if (bySource) {
      const [allEvents, likes, attendees] = await Promise.all([
        fetchBarcelonaEvents(startDate, endDate, filters),
        getLikes(),
        getAttendees()
      ]);
      // Agrupar por fuente
      const opendata = [];
      const ticketmaster = [];
      const allevents = [];
      // Añadir actividades de usuario como fuente separada
      const usuarioCityRadar = userActivities.map(e => ({ ...e, likes: likes[e.id] || 0, attendees: attendees[e.id] || 0 }));
      for (const e of allEvents) {
        const eventWithStats = { ...e, likes: likes[e.id] || 0, attendees: attendees[e.id] || 0 };
        if (e.origen === 'opendata-ajuntament') opendata.push(eventWithStats);
        else if (e.origen === 'ticketmaster') ticketmaster.push(eventWithStats);
        else if (e.origen === 'allevents') allevents.push(eventWithStats);
      }
      res.json({ opendata, ticketmaster, allevents, usuarioCityRadar });
      return;
    }

    // Modo legacy: array plano
    const [events, likes, attendees] = await Promise.all([
      fetchBarcelonaEvents(startDate, endDate, filters),
      getLikes(),
      getAttendees()
    ]);
    // Mezclar eventos externos y actividades de usuario
    const allEvents = [...events, ...userActivities];
    const eventsWithStats = allEvents.map(e => ({ ...e, likes: likes[e.id] || 0, attendees: attendees[e.id] || 0 }));
    console.log(`✅ Returning ${eventsWithStats.length} events (incluyendo usuario)`);
    res.json(eventsWithStats);
  } catch (error) {
    console.error('❌ Error in /api/events:', error.message);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

// Route to get registered activities
app.get('/api/activities', async (req, res) => {
  try {
    const activities = await getActivities();
    res.json(activities);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch activities' });
  }
});

// Likes: get all counts
app.get('/api/likes', async (req, res) => {
  try {
    res.json(await getLikes());
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch likes' });
  }
});

// Likes: toggle like/unlike for an event
app.post('/api/likes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { action } = req.body;
    if (action !== 'like' && action !== 'unlike') {
      return res.status(400).json({ error: 'action must be like or unlike' });
    }
    const count = await toggleLike(id, action);
    res.json({ id, likes: count });
  } catch (error) {
    res.status(500).json({ error: 'Failed to toggle like' });
  }
});

// Attendees: toggle attend/unattend for an event
app.post('/api/attend/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { action } = req.body;
    if (action !== 'attend' && action !== 'unattend') {
      return res.status(400).json({ error: 'action must be attend or unattend' });
    }
    const count = await toggleAttend(id, action);
    res.json({ id, attendees: count });
  } catch (error) {
    res.status(500).json({ error: 'Failed to toggle attendance' });
  }
});

// Route to add a new activity
app.post('/api/activities', async (req, res) => {
  try {
    const newActivity = req.body;
    const activities = await addActivity(newActivity);
    res.json(activities);
  } catch (error) {
    res.status(500).json({ error: 'Failed to add activity' });
  }
});

// Debug endpoint: test categorization
app.post('/api/debug/categorize', (req, res) => {
  try {
    const { name, body } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }
    
    // Simular inferCategory logic
    const text = ((name || '') + ' ' + (body || '')).toLowerCase();
    const keywordMatches = {};
    let assignedCategory = 'other';
    
    for (const [catId, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
      const matched = keywords.filter(kw => {
        const regex = new RegExp(`\\b${kw}\\b`, 'i');
        return regex.test(text);
      });
      keywordMatches[catId] = matched;
      if (matched.length > 0 && assignedCategory === 'other') {
        assignedCategory = catId;
      }
    }
    
    res.json({
      input: { name, body },
      assigned_category: assignedCategory,
      keyword_matches: keywordMatches,
      search_text: text
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to categorize', message: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});