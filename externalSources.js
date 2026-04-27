// Módulos de integración para Meetup, Eventbrite y AllEvents.in
const axios = require('axios');

async function fetchMeetupEvents() {
  // Requiere API Key de Meetup (usar variable de entorno)
  const apiKey = process.env.MEETUP_API_KEY;
  if (!apiKey) return [];
  try {
    const url = `https://api.meetup.com/find/upcoming_events?key=${apiKey}&sign=true&lon=2.1734&lat=41.3851&radius=10&topic_category=292`; // Barcelona
    const res = await axios.get(url);
    if (res.data && res.data.events) {
      return res.data.events.map(ev => ({
        id: `meetup_${ev.id}`,
        name: ev.name,
        body: ev.description || '',
        start_date: ev.local_date || '',
        end_date: ev.local_date || '',
        geo_epgs_4326_latlon: ev.venue ? `${ev.venue.lat},${ev.venue.lon}` : '',
        category: 'meetup',
        origen: 'meetup',
        direccion: ev.venue ? ev.venue.address_1 : ''
      }));
    }
  } catch (e) {
    console.log('Error Meetup:', e.message);
  }
  return [];
}

async function fetchEventbriteEvents() {
  // Requiere Private Token de Eventbrite (usar variable de entorno)
  const privateToken = process.env.EVENTBRITE_API_KEY;
  if (!privateToken) return [];
  try {
    const url = `https://www.eventbriteapi.com/v3/events/search/?location.address=barcelona`;
    const res = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${privateToken}`
      }
    });
    if (res.data && res.data.events) {
      return res.data.events.map(ev => ({
        id: `eventbrite_${ev.id}`,
        name: ev.name && ev.name.text,
        body: ev.description && ev.description.text,
        start_date: ev.start && ev.start.local ? ev.start.local.split('T')[0] : '',
        end_date: ev.end && ev.end.local ? ev.end.local.split('T')[0] : '',
        geo_epgs_4326_latlon: '', // Eventbrite no siempre da lat/lon
        category: 'eventbrite',
        origen: 'eventbrite',
        direccion: ev.venue_id || ''
      }));
    }
  } catch (e) {
    console.log('Error Eventbrite:', e.message);
  }
  return [];
}

async function fetchAllEventsIn() {
  // API pública, no requiere autenticación
  try {
    const url = `https://allevents.in/barcelona/all?ref=eventlist-new&format=json`;
    const res = await axios.get(url);
    if (res.data && res.data.data) {
      return res.data.data.map(ev => ({
        id: `allevents_${ev.event_id}`,
        name: ev.eventname,
        body: ev.description,
        start_date: ev.start_time ? ev.start_time.split(' ')[0] : '',
        end_date: ev.end_time ? ev.end_time.split(' ')[0] : '',
        geo_epgs_4326_latlon: ev.latitude && ev.longitude ? `${ev.latitude},${ev.longitude}` : '',
        category: 'allevents',
        origen: 'allevents',
        direccion: ev.venue ? ev.venue.full_address : ''
      }));
    }
  } catch (e) {
    console.log('Error AllEvents.in:', e.message);
  }
  return [];
}

module.exports = { fetchMeetupEvents, fetchEventbriteEvents, fetchAllEventsIn };