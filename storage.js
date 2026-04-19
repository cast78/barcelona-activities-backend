const fs = require('fs').promises;
const path = require('path');

const ACTIVITIES_FILE = path.join(__dirname, 'activities.json');

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