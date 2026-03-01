/**
 * TapRater — Cloudflare Worker
 *
 * Two endpoints:
 *
 *   POST /           — OCR text cleaning via Workers AI (Llama 3.1 8B).
 *                      Body: JSON { text: "<raw ocr text>" }
 *                      Returns: JSON { names: ["Beer 1", "Beer 2", ...] }
 *                      Requires an AI binding named "AI" in the dashboard.
 *
 *   GET /?q=<query>  — Untappd beer search. Scrapes untappd.com and returns
 *                      beer name/brewery/style/rating as JSON.
 *
 * Deploy: paste this file into the Cloudflare Workers dashboard and click Deploy.
 * AI binding: Settings → Bindings → Add → Workers AI → name it "AI".
 */

export default {
  async fetch(request, env) {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }

    // POST → OCR text cleaning via Workers AI
    if (request.method === 'POST') {
      return handleOcrClean(request, env, cors);
    }

    // GET → Untappd search (existing behaviour)
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');
    const debug = searchParams.get('debug') === '1';

    if (!query) {
      return jsonResponse({ error: 'Missing ?q= parameter' }, 400, cors);
    }

    try {
      const html = await fetchUntappdSearch(query);

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
// OCR cleaning via Workers AI
// ---------------------------------------------------------------------------

async function handleOcrClean(request, env, cors) {
  if (!env.AI) {
    return jsonResponse(
      { error: 'AI binding not configured. In the Cloudflare dashboard: Worker → Settings → Bindings → Add → Workers AI → name it "AI".' },
      503, cors,
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Request body must be JSON with a "text" field.' }, 400, cors);
  }

  const text = typeof body?.text === 'string' ? body.text : '';
  if (!text.trim()) {
    return jsonResponse({ error: 'Missing or empty "text" field.' }, 400, cors);
  }

  const prompt =
    'You are extracting beer names from OCR text scanned from a brewery tap list. ' +
    'The OCR is imperfect and may contain garbled text, descriptions, prices, and noise.\n\n' +
    'Return ONLY the beer names, one per line, with no extra text, numbers, bullets, or explanations. ' +
    'If you are unsure whether a line is a beer name, include it — missing a beer is worse than including noise.\n\n' +
    'OCR text:\n' +
    text.slice(0, 4000); // guard against very long input

  try {
    const response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1024,
    });

    const names = (response.response ?? '')
      .split('\n')
      .map(l => l.trim())
      .map(l => l.replace(/^\d+[.)]\s+/, ''))   // strip "1. " / "1) "
      .map(l => l.replace(/^[-–•*]\s+/, ''))     // strip "- " / "• "
      .filter(l => l.length >= 3 && l.length <= 100)
      // drop lines that look like model preamble rather than beer names
      .filter(l => !/^(here are|the following|beer names|i('ve)? identified|below|the ocr|these are)/i.test(l));

    return jsonResponse({ names }, 200, cors);
  } catch (err) {
    return jsonResponse({ error: `AI inference failed: ${err.message}` }, 500, cors);
  }
}

// ---------------------------------------------------------------------------
// Untappd fetch + parse
// ---------------------------------------------------------------------------

async function fetchUntappdSearch(query) {
  const url = `https://untappd.com/search?q=${encodeURIComponent(query)}&type=beer`;

  const resp = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache',
    },
  });

  if (!resp.ok) throw new Error(`Untappd returned HTTP ${resp.status}`);
  return resp.text();
}

function parseBeers(html) {
  const results = [];
  const seen = new Set();
  const beerLinkRe = /href="(\/b\/[^"]+?\/(\d+))"[^>]*>([^<]{2,})<\/a>/g;

  let m;
  while ((m = beerLinkRe.exec(html)) !== null) {
    const [, path, id, rawName] = m;
    const name = rawName.trim();
    if (seen.has(id) || !name) continue;
    seen.add(id);

    const chunk = html.slice(m.index, m.index + 800);
    const brewery   = chunk.match(/<p class="brewery"><a[^>]*>([^<]+)<\/a>/)?.[1]?.trim() ?? null;
    const style     = chunk.match(/<p class="style">([^<]+)<\/p>/)?.[1]?.trim() ?? null;
    const ratingStr = chunk.match(/data-rating="(\d+\.\d+)"/)?.[1] ?? null;

    results.push({
      name,
      brewery,
      style,
      rating: ratingStr ? parseFloat(ratingStr) : null,
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
