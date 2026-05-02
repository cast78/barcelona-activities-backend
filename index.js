const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const { fetchBarcelonaEvents } = require('./apiClient');
const { getActivities, addActivity, getLikes, toggleLike } = require('./storage');

const app = express();
const PORT = process.env.PORT || 3001;

const ALLOWED_ORIGINS = (process.env.FRONTEND_URL || 'https://barcelona-activities-frontend.vercel.app')
  .split(',')
  .map(o => o.trim())
  .concat(['http://localhost:3000', 'http://localhost:3001']);

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
    const { startDate, endDate } = req.query;
    const [events, likes] = await Promise.all([fetchBarcelonaEvents(startDate, endDate), getLikes()]);
    const eventsWithLikes = events.map(e => ({ ...e, likes: likes[e.id] || 0 }));
    console.log(`✅ Returning ${eventsWithLikes.length} events`);
    res.json(eventsWithLikes);
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

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});