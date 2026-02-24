/**
 * TapRater — Cloudflare Worker
 *
 * Scrapes Untappd beer search results and returns JSON.
 * Deploy this file to Cloudflare Workers via the browser dashboard.
 *
 * Usage: GET https://your-worker.workers.dev/?q=Two+Hearted+Ale
 */

export default {
  async fetch(request) {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');
    const debug = searchParams.get('debug') === '1';

    if (!query) {
      return jsonResponse({ error: 'Missing ?q= parameter' }, 400, cors);
    }

    try {
      const html = await fetchUntappdSearch(query);

      // Debug mode: return a raw HTML slice around the first beer link so we
      // can inspect the actual page structure if parsing breaks.
      if (debug) {
        const firstBeer = /href="(\/b\/[^"]+?\/(\d+))"[^>]*>([^<]{2,})<\/a>/;
        const m = firstBeer.exec(html);
        const slice = m ? html.slice(m.index, m.index + 1200) : html.slice(0, 1200);
        return new Response(slice, { headers: { ...cors, 'Content-Type': 'text/plain' } });
      }

      const results = parseBeers(html);
      return jsonResponse({ query, results }, 200, cors);
    } catch (err) {
      return jsonResponse({ error: err.message }, 500, cors);
    }
  },
};

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

async function fetchUntappdSearch(query) {
  const url = `https://untappd.com/search?q=${encodeURIComponent(query)}&type=beer`;

  const resp = await fetch(url, {
    headers: {
      // Mimic a real Android Chrome browser to avoid bot-detection
      'User-Agent':
        'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache',
    },
  });

  if (!resp.ok) {
    throw new Error(`Untappd returned HTTP ${resp.status}`);
  }

  return resp.text();
}

// ---------------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------------

/**
 * Extracts up to 5 beer results from raw Untappd search HTML.
 *
 * Untappd renders beer links as:
 *   <a href="/b/brewery-name-beer-name/12345">Beer Name</a>
 *
 * Each beer appears twice (once wrapping an image, once as plain text).
 * We skip the image-only links by requiring text content of 2+ characters.
 *
 * Nearby spans contain: brewery link, style ("IPA - American"), rating "(3.85)"
 */
function parseBeers(html) {
  const results = [];
  const seen = new Set();

  // Match beer text links: href="/b/slug/numericId">Name</a>
  const beerLinkRe = /href="(\/b\/[^"]+?\/(\d+))"[^>]*>([^<]{2,})<\/a>/g;

  let m;
  while ((m = beerLinkRe.exec(html)) !== null) {
    const [, path, id, rawName] = m;
    const name = rawName.trim();

    if (seen.has(id) || !name) continue;
    seen.add(id);

    // Grab a window of HTML after this match to find associated metadata
    const chunk = html.slice(m.index, m.index + 800);

    // All three fields use Untappd's actual CSS classes (confirmed via debug endpoint).
    // HTML structure per result:
    //   <p class="brewery"><a href="/slug">Brewery Name</a></p>
    //   <p class="style">IPA - American</p>
    //   <div class="caps" data-rating="3.937">

    const brewery =
      chunk.match(/<p class="brewery"><a[^>]*>([^<]+)<\/a>/)?.[1]?.trim() ?? null;

    const style =
      chunk.match(/<p class="style">([^<]+)<\/p>/)?.[1]?.trim() ?? null;

    const ratingStr = chunk.match(/data-rating="(\d+\.\d+)"/)?.[1] ?? null;
    const rating = ratingStr ? parseFloat(ratingStr) : null;

    results.push({
      name,
      brewery,
      style,
      rating,
      url: `https://untappd.com${path}`,
    });

    if (results.length >= 5) break;
  }

  return results;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonResponse(data, status, corsHeaders) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
