# TapRater — Deployment Guide

Scan a brewery menu photo → see Untappd ratings for every beer.

---

## Files

| File | Purpose |
|---|---|
| `worker.js` | Paste into Cloudflare Worker (backend scraper) |
| `index.html` | The app itself |
| `manifest.json` | PWA metadata (makes it installable on Android) |
| `icon.svg` | App icon |
| `sw.js` | Service worker (offline support) |

---

## Step 1 — Deploy the Cloudflare Worker (backend)

The worker fetches Untappd on your behalf, bypassing browser CORS restrictions.

1. Go to **https://cloudflare.com** and create a free account (or log in).
2. In the left sidebar click **Workers & Pages → Create**.
3. Click **Create Worker**.
4. Delete all the placeholder code in the editor.
5. Paste the entire contents of `worker.js` into the editor.
6. Click **Deploy**.
7. Copy the Worker URL shown at the top — it looks like:
   `https://taprater.your-name.workers.dev`

---

## Step 2 — Update the app with your Worker URL

Open `index.html` in any text editor (Notepad is fine).

Find this line near the bottom:
```
const WORKER_URL = 'YOUR_WORKER_URL';
```

Replace `YOUR_WORKER_URL` with the URL you copied in Step 1:
```
const WORKER_URL = 'https://taprater.your-name.workers.dev';
```

Save the file.

---

## Step 3 — Host the app on GitHub Pages (free)

1. Go to **https://github.com** and create a free account (or log in).
2. Click **+** → **New repository**.
   - Name it `taprater`
   - Set it to **Public**
   - Click **Create repository**
3. On the next screen click **uploading an existing file**.
4. Drag and drop ALL four files into the upload area:
   - `index.html`
   - `manifest.json`
   - `icon.svg`
   - `sw.js`
5. Click **Commit changes**.
6. Go to **Settings → Pages**.
7. Under **Branch**, select `main` and click **Save**.
8. After ~1 minute, your app will be live at:
   `https://your-github-username.github.io/taprater/`

---

## Step 4 — Install on your Android phone

1. Open Chrome on your Android phone.
2. Visit `https://your-github-username.github.io/taprater/`
3. Tap the **⋮ menu** (top right) → **Add to Home screen**.
4. Tap **Add**.

TapRater now appears on your home screen like a native app.

---

## Using TapRater at a brewery

1. Open TapRater.
2. Tap **Take Photo** and snap the beer menu.
3. Wait for OCR to read the menu (~5–15 seconds).
4. Edit the text down to just the beer names — one per line.
   Delete descriptions, prices, ABV%, etc.
5. Tap **Search Untappd**.
6. Ratings appear with color indicators:
   - 🟢 Green = 4.0+ (great)
   - 🟡 Yellow-green = 3.5–4.0 (good)
   - 🟠 Orange = 3.0–3.5 (average)
   - 🔴 Red = below 3.0
7. Tap **View ↗** on any beer to open its full Untappd page.

---

## Troubleshooting

**"Not found on Untappd"** — The OCR may have misread the beer name.
Go back and correct the spelling, then search again.

**Worker returns an error** — Untappd may have temporarily blocked the request.
Wait a moment and try again.

**OCR is slow on first use** — Tesseract downloads ~10 MB of language data
the first time. This is cached and subsequent runs are fast.
