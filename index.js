const express = require('express');
const cors = require('cors');
const { fetchBarcelonaEvents } = require('./apiClient');
const { getActivities, addActivity } = require('./storage');

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
    const events = await fetchBarcelonaEvents();
    console.log(`✅ Returning ${events.length} events`);
    res.json(events);
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