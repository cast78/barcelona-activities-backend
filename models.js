// Data models for activities and events

// Category IDs válidos
const VALID_CATEGORIES = ['sport', 'culture', 'music', 'food', 'family', 'nature', 'night'];

// Event model based on Barcelona Open Data API
const EventModel = {
  register_id: 'string',        // Unique identifier
  name: 'string',               // Event name
  start_date: 'string',         // Start date (YYYY-MM-DD)
  end_date: 'string',           // End date (YYYY-MM-DD)
  geo_epgs_4326_latlon: 'string', // Lat,lon coordinates
  body: 'string',               // Description
  category: 'string',           // Category ID: sport | culture | music | food | family | nature | night
  addresses: 'array',           // Address details (optional)
};

// Activity model for user-registered activities
const ActivityModel = {
  id: 'string',                 // Unique identifier (timestamp)
  name: 'string',               // Activity name
  body: 'string',               // Description
  start_date: 'string',         // Start date (YYYY-MM-DD)
  end_date: 'string',           // End date (YYYY-MM-DD)
  geo_epgs_4326_latlon: 'string', // Lat,lon coordinates
  category: 'string',           // Category ID: sport | culture | music | food | family | nature | night
};

module.exports = { EventModel, ActivityModel, VALID_CATEGORIES };
