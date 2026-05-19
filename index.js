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
  .concat(['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002']);

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
    const { startDate, endDate, currentTime } = req.query;
    console.log(`[API] /events request: startDate=${startDate}, endDate=${endDate}, currentTime=${currentTime}`);
    const [events, likes, attendees] = await Promise.all([fetchBarcelonaEvents(startDate, endDate, currentTime), getLikes(), getAttendees()]);
    const eventsWithStats = events.map(e => ({ ...e, likes: likes[e.id] || 0, attendees: attendees[e.id] || 0 }));
    console.log(`✅ Returning ${eventsWithStats.length} events`);
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