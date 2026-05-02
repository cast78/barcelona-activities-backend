const fs = require('fs').promises;
const path = require('path');

const ACTIVITIES_FILE = path.join(__dirname, 'activities.json');
const LIKES_FILE = path.join(__dirname, 'likes.json');
const ATTENDEES_FILE = path.join(__dirname, 'attendees.json');

// Initialize file if not exists
async function initStorage() {
  try {
    await fs.access(ACTIVITIES_FILE);
  } catch {
    await fs.writeFile(ACTIVITIES_FILE, JSON.stringify([]));
  }
}

// Get all registered activities
async function getActivities() {
  await initStorage();
  const data = await fs.readFile(ACTIVITIES_FILE, 'utf8');
  return JSON.parse(data);
}

// Add a new activity
async function addActivity(activity) {
  const activities = await getActivities();
  activities.push({ id: Date.now().toString(), ...activity });
  await fs.writeFile(ACTIVITIES_FILE, JSON.stringify(activities, null, 2));
  return activities;
}

module.exports = { getActivities, addActivity };

// ── Likes ──────────────────────────────────────────────────────────────────

async function initLikes() {
  try { await fs.access(LIKES_FILE); }
  catch { await fs.writeFile(LIKES_FILE, JSON.stringify({})); }
}

async function getLikes() {
  await initLikes();
  const data = await fs.readFile(LIKES_FILE, 'utf8');
  return JSON.parse(data);
}

// action: 'like' | 'unlike'
async function toggleLike(id, action) {
  const likes = await getLikes();
  if (action === 'like') {
    likes[id] = (likes[id] || 0) + 1;
  } else {
    likes[id] = Math.max(0, (likes[id] || 0) - 1);
    if (likes[id] === 0) delete likes[id];
  }
  await fs.writeFile(LIKES_FILE, JSON.stringify(likes, null, 2));
  return likes[id] || 0;
}

module.exports = { getActivities, addActivity, getLikes, toggleLike };

// ── Attendees ──────────────────────────────────────────────────────────────

async function initAttendees() {
  try { await fs.access(ATTENDEES_FILE); }
  catch { await fs.writeFile(ATTENDEES_FILE, JSON.stringify({})); }
}

async function getAttendees() {
  await initAttendees();
  const data = await fs.readFile(ATTENDEES_FILE, 'utf8');
  return JSON.parse(data);
}

// action: 'attend' | 'unattend'
async function toggleAttend(id, action) {
  const attendees = await getAttendees();
  if (action === 'attend') {
    attendees[id] = (attendees[id] || 0) + 1;
  } else {
    attendees[id] = Math.max(0, (attendees[id] || 0) - 1);
    if (attendees[id] === 0) delete attendees[id];
  }
  await fs.writeFile(ATTENDEES_FILE, JSON.stringify(attendees, null, 2));
  return attendees[id] || 0;
}

module.exports = { getActivities, addActivity, getLikes, toggleLike, getAttendees, toggleAttend };