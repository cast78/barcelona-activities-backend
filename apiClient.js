const axios = require('axios');
const { VALID_CATEGORIES } = require('./models');

// Keywords para inferir categoria automaticamente (mirror del frontend)
const CATEGORY_KEYWORDS = {
  sport:   ["sport","deporte","running","futbol","basket","tennis","nataci","esport","atletis","padel","ciclis","volei","volley"],
  culture: ["cultur","museu","museo","teatr","exposici","art","cine","cinema","patrimoni","literatu","gotic","gothic","visita"],
  music:   ["music","concert","festival","jazz","rock","orquestr","dansa","ball","flamenco"],
  food:    ["gastronom","restaurant","mercat","food","cuina","tast","vi","vermut","mercat"],
  family:  ["famili","familiar","nens","kids","infantil","infants","jovent","escola","casteller"],
  nature:  ["natura","parc","senderis","jardi","medi ambient","ecolog","bosc","platj","mar","guell","tibidabo"],
  night:   ["nocturno","noche","nit","bar","discoteca","club","cocktail","pub","after","festa","party","nightclub","copa","karaoke"]
};

function inferCategory(record) {
  const text = ((record.name || '') + ' ' + (record.body || '')).toLowerCase();
  for (const [catId, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(kw => text.includes(kw))) return catId;
  }
  return null;
}

// ✅ Generar eventos con fechas dinámicas (hoy + 10 días)
function generateMockEvents() {
  const today = new Date();
  const fmt = (d) => d.toISOString().split('T')[0];
  
  const getDate = (daysFromNow) => {
    const d = new Date(today);
    d.setDate(d.getDate() + daysFromNow);
    return fmt(d);
  };

  return [
    { register_id: 'evt001', name: 'Sagrada Familia Tour',               start_date: getDate(0), end_date: getDate(5), geo_epgs_4326_latlon: '41.4036,2.1744',  body: 'Visita guiada a la Sagrada Familia.',             category: 'culture' },
    { register_id: 'evt002', name: 'Park Guell Experience',              start_date: getDate(1), end_date: getDate(7), geo_epgs_4326_latlon: '41.3847,2.1521',  body: 'Explora el parque mas hermoso de Barcelona.',     category: 'nature'  },
    { register_id: 'evt003', name: 'Gothic Quarter Walking Tour',        start_date: getDate(0), end_date: getDate(10), geo_epgs_4326_latlon: '41.3851,2.1734',  body: 'Recorrido por el barrio gotico medieval.',         category: 'culture' },
    { register_id: 'evt004', name: 'Beach Volleyball Tournament',        start_date: getDate(2), end_date: getDate(2), geo_epgs_4326_latlon: '41.3863,2.1841',  body: 'Torneo de voleibol en la playa de Barcelona.',    category: 'sport'   },
    { register_id: 'evt005', name: 'Jazz al Parc de la Ciutadella',      start_date: getDate(1), end_date: getDate(1), geo_epgs_4326_latlon: '41.3862,2.1868',  body: 'Concert de jazz en viu. Entrada lliure.',          category: 'music'   },
    { register_id: 'evt006', name: 'Mercat de Santa Caterina',           start_date: getDate(3), end_date: getDate(3), geo_epgs_4326_latlon: '41.3851,2.1770',  body: 'Tast de productes locals al Mercat de Santa Caterina.', category: 'food' },
    { register_id: 'evt007', name: 'Festa Familiar al Tibidabo',         start_date: getDate(5), end_date: getDate(5), geo_epgs_4326_latlon: '41.4216,2.1184',  body: 'Jornada familiar amb activitats per a nens.',     category: 'family'  },
    { register_id: 'evt008', name: 'Nit de Copes al Born',               start_date: getDate(2), end_date: getDate(8), geo_epgs_4326_latlon: '41.3855,2.1824',  body: 'Ruta de cocktails pels bars del barri del Born.', category: 'night'   }
  ];
}

async function fetchBarcelonaEvents() {
  try {
    const response = await axios.get(
      'https://opendata-ajuntament.barcelona.cat/data/api/action/datastore_search?resource_id=da9e71de-0f8e-417d-928a-56380bfd0231&limit=100',
      { timeout: 5000 }
    );
    if (response.data && response.data.result && response.data.result.records) {
      // Enriquecer con category inferida si no tienen una
      return response.data.result.records.map(rec => ({
        ...rec,
        category: rec.category || inferCategory(rec)
      }));
    }
  } catch (apiError) {
    console.log('API real no disponible, usando datos mock con fechas actuales');
  }
  return generateMockEvents(); // ✅ Retorna eventos con fechas dinámicas
}

module.exports = { fetchBarcelonaEvents };