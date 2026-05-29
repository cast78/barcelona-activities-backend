// Módulos de integración para Ticketmaster y AllEvents.in
const axios = require('axios');

async function fetchTicketmasterEvents(startDate, endDate, opts = {}) {
  const apiKey = process.env.TICKETMASTER_API_KEY;
  if (!apiKey) return [];
  try {
    const { lat, lon, radius, category } = opts;
    const startDateTime = startDate
      ? `${startDate}T00:00:00Z`
      : new Date().toISOString().split('.')[0] + 'Z';
    const endDateTime = endDate ? `${endDate}T23:59:59Z` : '';
    const endParam = endDateTime ? `&endDateTime=${endDateTime}` : '';
    let url = `https://app.ticketmaster.com/discovery/v2/events.json?city=Barcelona&countryCode=ES&size=50&startDateTime=${startDateTime}${endParam}&apikey=${apiKey}`;
    if (lat && lon) url += `&latlong=${lat},${lon}`;
    if (radius) url += `&radius=${radius}`;
    if (category) url += `&classificationName=${encodeURIComponent(category)}`;
    const res = await axios.get(url, { timeout: 10000 });
    const events = res.data && res.data._embedded && res.data._embedded.events;
    if (!events) return [];
    return events.map(ev => {
      const venue = ev._embedded && ev._embedded.venues && ev._embedded.venues[0];
      const lat = venue && venue.location && venue.location.latitude;
      const lon = venue && venue.location && venue.location.longitude;
      const address = venue && venue.address && venue.address.line1;
      const city = venue && venue.city && venue.city.name;
      const direccion = [address, city].filter(Boolean).join(', ');
      const genre = ev.classifications && ev.classifications[0] && ev.classifications[0].genre && ev.classifications[0].genre.name;
      const subGenre = ev.classifications && ev.classifications[0] && ev.classifications[0].subGenre && ev.classifications[0].subGenre.name;
      const bodyParts = [
        ev.description || ev.info || ev.pleaseNote || '',
        genre && genre !== 'Undefined' ? `Género: ${genre}` : '',
        subGenre && subGenre !== 'Undefined' ? subGenre : ''
      ].filter(Boolean);
      return {
        id: `ticketmaster_${ev.id}`,
        name: ev.name,
        body: bodyParts.join(' · ') || '',
        start_date: ev.dates && ev.dates.start && ev.dates.start.localDate,
        start_time: ev.dates && ev.dates.start && ev.dates.start.localTime || '',
        end_date: ev.dates && ev.dates.end && ev.dates.end.localDate || null,
        geo_epgs_4326_latlon: lat && lon ? `${lat},${lon}` : '',
        category: 'ticketmaster',
        origen: 'ticketmaster',
        direccion
      };
    });
  } catch (e) {
    console.log('Error Ticketmaster:', e.message);
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

module.exports = { fetchTicketmasterEvents, fetchAllEventsIn };