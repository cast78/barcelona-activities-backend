const axios = require('axios');
require('dotenv').config();

async function investigateTicketmaster() {
  const apiKey = process.env.TICKETMASTER_API_KEY;
  console.log('🔍 Investigating Ticketmaster categories...\n');

  try {
    // Query WITHOUT filter to see all events and categories
    const url = `https://app.ticketmaster.com/discovery/v2/events.json?city=Barcelona&countryCode=ES&size=50&startDateTime=2026-05-19T00:00:00Z&endDateTime=2026-05-20T23:59:59Z&apikey=${apiKey}`;
    
    const res = await axios.get(url, { timeout: 10000 });
    const events = res.data._embedded?.events || [];
    
    console.log(`📊 Total events found: ${events.length}\n`);
    
    if (events.length === 0) {
      console.log('❌ No events found');
      return;
    }

    const categoriesMap = {};
    
    events.forEach((e, idx) => {
      const name = e.name;
      const genre = e.classifications?.[0]?.genre?.name || 'N/A';
      const segment = e.classifications?.[0]?.segment?.name || 'N/A';
      const subGenre = e.classifications?.[0]?.subGenre?.name || 'N/A';
      
      // Group by genre
      if (!categoriesMap[genre]) {
        categoriesMap[genre] = [];
      }
      categoriesMap[genre].push({ name, segment, subGenre });
      
      console.log(`${idx + 1}. ${name}`);
      console.log(`   Genre: ${genre} | Segment: ${segment} | SubGenre: ${subGenre}`);
      console.log('');
    });
    
    console.log('\n📋 Summary by Genre:');
    Object.entries(categoriesMap).forEach(([genre, items]) => {
      console.log(`\n${genre} (${items.length} events):`);
      items.forEach(item => {
        console.log(`  - ${item.name} [Segment: ${item.segment}]`);
      });
    });

  } catch (err) {
    console.error('❌ Error:', err.message);
  }
}

investigateTicketmaster();
