// Scraper para obtener hora de inicio y lugar desde guia.barcelona.cat
// URL pattern: https://guia.barcelona.cat/es/detall/{slug}_{register_id}.html
const axios = require('axios');

/**
 * Convierte un nombre de evento al slug usado en guia.barcelona.cat
 * e.g. 'Concert "Camila Bañados"' → 'concert-camila-banados'
 */
function nameToSlug(name) {
  return (name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // quitar diacríticos (á→a, é→e, ñ→n, etc.)
    .replace(/[·ŀ]/g, 'l')           // l·l catalana
    .replace(/[^a-z0-9]+/g, '-')     // todo lo demás → guión
    .replace(/^-+|-+$/g, '');        // quitar guiones iniciales/finales
}

/**
 * Extrae la hora de inicio del HTML de guia.barcelona.cat
 * Formatos encontrados: "a les 20.00 h", "les 9.30 h", "a les 10 h"
 * Devuelve "HH:MM" o cadena vacía
 */
function extractTime(html) {
  // "a les 20.00 h" o "les 9.30 h"
  let m = html.match(/les\s+(\d{1,2})[.:](\d{2})\s*h/i);
  if (m) return `${m[1].padStart(2, '0')}:${m[2]}`;

  // "a les 10 h" (hora en punto sin minutos)
  m = html.match(/les\s+(\d{1,2})\s*h\b/i);
  if (m) {
    const h = parseInt(m[1], 10);
    if (h >= 6 && h <= 23) return `${m[1].padStart(2, '0')}:00`;
  }

  // Patrón genérico "20.30 h" o "20:30 h"
  m = html.match(/\b(\d{1,2})[.:](\d{2})\s*h\b/i);
  if (m) {
    const h = parseInt(m[1], 10);
    if (h >= 6 && h <= 23) return `${m[1].padStart(2, '0')}:${m[2]}`;
  }

  return '';
}

/**
 * Extrae el nombre del lugar/venue del HTML de guia.barcelona.cat
 * Estructura real: <div class="info-lloc"><h3><a href="...">Nombre venue</a></h3>
 * O: <dt>Se celebra en: </dt><dd ...><a href="...">Nombre venue</a>
 */
function extractVenueName(html) {
  // Patrón principal: div.info-lloc > h3 > a
  let m = html.match(/<div class="info-lloc">\s*<h3>\s*<a[^>]*>([^<]+)<\/a>/i);
  if (m) return m[1].trim();

  // Fallback: <dt>Se celebra en:</dt><dd ...><a>Nombre</a>
  m = html.match(/<dt>Se celebra en:[^<]*<\/dt>\s*<dd[^>]*>\s*<a[^>]*>([^<]+)<\/a>/i);
  if (m) return m[1].trim();

  return '';
}

/**
 * Extrae la dirección postal del HTML
 * Estructura real: <dt>Dirección:</dt><dd class="notranslate">Plaça Reial, 18</dd>
 */
function extractAddress(html) {
  let m = html.match(/<dt[^>]*>Direcci[oó]n:<\/dt>\s*<dd[^>]*>([^<]+)<\/dd>/i);
  if (m) return m[1].trim();
  return '';
}

/**
 * Extrae información de precio de la tabla de horarios
 * Nota: guia.barcelona.cat usa non-breaking space (\u00a0) antes de "h"
 * Estructura: ...<div>a les 20.00\u00a0h</div></td><td ...>\n<div>Entrada general: 15 €</div>
 */
function extractPrice(html) {
  // \s* cubre tanto espacio normal como \u00a0 (non-breaking space)
  const m = html.match(/<div>a les \d{1,2}[.]\d{2}\s*h<\/div><\/td><td[^>]*>\s*<div>([\s\S]*?)<\/div>/i);
  if (m) return m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  return '';
}

/**
 * Scrapea la página de detalle de un evento en guia.barcelona.cat
 * @param {string} registerId - register_id del dataset CKAN
 * @param {string} eventName  - nombre del evento (para construir el slug)
 * @returns {Promise<{start_time, venue_name, venue_address, price}>}
 */
async function scrapeEventDetails(registerId, eventName) {
  // Limpiar posible BOM (\uFEFF) que el dataset CKAN añade al register_id
  const cleanId = (registerId || '').replace(/^\uFEFF/, '');
  if (!cleanId) return {};

  const slug = nameToSlug(eventName || '');
  const url = `https://guia.barcelona.cat/es/detall/${slug}_${cleanId}.html`;

  try {
    const response = await axios.get(url, {
      timeout: 5000,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BarcelonaEventsApp/1.0)' }
    });
    const html = response.data || '';

    return {
      start_time:    extractTime(html),
      venue_name:    extractVenueName(html),
      venue_address: extractAddress(html),
      price:         extractPrice(html)
    };
  } catch (_) {
    return {};
  }
}

/**
 * Enriquece un array de eventos opendata con hora de inicio y lugar,
 * scrapeando guia.barcelona.cat en paralelo (por lotes).
 *
 * @param {Array}  events              - eventos opendata normalizados (con .id y .name)
 * @param {object} opts
 * @param {number} opts.concurrency    - peticiones en paralelo (default 10)
 * @param {number} opts.maxEvents      - máximo de eventos a scrapear (default 40)
 * @returns {Promise<Array>}
 */
async function enrichWithGuiaBCN(events, { concurrency = 10, maxEvents = 40 } = {}) {
  const limit = Math.min(events.length, maxEvents);
  const scrapedResults = new Array(limit).fill(null);

  for (let i = 0; i < limit; i += concurrency) {
    const batch = events.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(ev => scrapeEventDetails(ev.id, ev.name))
    );
    batchResults.forEach((res, j) => { scrapedResults[i + j] = res || {}; });
  }

  return events.map((ev, idx) => {
    if (idx >= limit) return ev;
    const s = scrapedResults[idx];

    const enriched = { ...ev };

    // Hora: usar valor scrapeado si existe
    if (s.start_time) enriched.start_time = s.start_time;

    // Nombre del lugar (venue)
    enriched.venue_name = s.venue_name || '';

    // Dirección: preferir street-address scrapeado; si no, mantener la de CKAN
    if (s.venue_address) enriched.direccion = s.venue_address;

    // Precio: añadir al principio del body si existe
    if (s.price) {
      const priceTag = `Precio: ${s.price}`;
      enriched.body = enriched.body ? `${priceTag} · ${enriched.body}` : priceTag;
    }

    return enriched;
  });
}

module.exports = { enrichWithGuiaBCN, scrapeEventDetails, nameToSlug };
