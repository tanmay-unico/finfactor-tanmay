## Air Quality Explorer

This is a small, local project that lets you type in a city name and see its **Air Quality Index (AQI)**, plus a quick breakdown of the main pollutants in the air.

It’s split into two parts:

- **Backend** – Node.js + Express REST API that talks to an external AQI provider and adds caching.
- **Frontend** – A single HTML/CSS/JavaScript page that hits the backend and renders a nice, compact dashboard.

---

### What powers the AQI data?

All air quality data comes from the **World Air Quality Index (WAQI)** project.

- API docs: `https://aqicn.org/api/`
- Endpoint used by the backend:
  - `GET https://api.waqi.info/feed/{city}/?token={YOUR_TOKEN}`
- Fields we care about:
  - Overall `aqi` value,
  - `iaqi` (per‑pollutant values such as PM2.5, PM10, O₃, NO₂, SO₂, CO),
  - `city` info (name, coordinates, URL),
  - `time` metadata,
  - `dominentpol` and `attributions`.

Your WAQI token is **never** exposed to the browser. It is read from an environment variable on the server and only used there.

---

### Project layout (short tour)

- `server/index.js` – Express app, routes, static file serving.
- `server/aqiService.js` – Calls WAQI, normalizes the response, and handles caching.
- `public/index.html` – The main page you see in the browser.
- `public/styles.css` – Styling and layout.
- `public/app.js` – Frontend logic: calling `/api/aqi` and updating the UI.
- `package.json` – Dependencies and scripts.

---

### Getting it running locally

#### Prerequisites

- Node.js **18+**
- A WAQI API token from `https://aqicn.org/api/` (the free token is fine)

#### Steps

1. Install dependencies:

   ```bash
   npm install
   ```

2. Set environment variables so the server can reach WAQI:

   On Windows PowerShell:

   ```powershell
   $env:AQICN_API_TOKEN = "your_waqi_api_token_here"
   $env:PORT = "3000"
   ```

   Or create a `.env` file in the project root:

   ```text
   AQICN_API_TOKEN=your_waqi_api_token_here
   PORT=3000
   ```

   For a quick **demo only**, you can use this sample token:

   ```text
   AQICN_API_TOKEN=e93e28e375ade73929b68ee88c49e1702971e155
   ```

   It’s still recommended to request your own token from `https://aqicn.org/api/` for any serious use.

3. Start the server:

   ```bash
   npm start
   ```

4. Open the app:

   - Visit `http://localhost:3000`
   - Enter a city name (e.g. `Delhi`, `London`, `Los Angeles`) and hit **Enter** or click **Search**.

---

### Backend API (what the frontend talks to)

Everything is served from the same origin as the UI (`http://localhost:PORT`).

- **Health check**

  - **Method**: `GET`
  - **Path**: `/api/health`
  - **Response**:

    ```json
    {
      "status": "ok",
      "message": "Air Quality Search API is running"
    }
    ```

- **AQI lookup**

  - **Method**: `GET`
  - **Path**: `/api/aqi`
  - **Query params**:
    - `city` (string, required): city name to search for
  - **Happy-path response** (`200 OK`, trimmed for brevity):

    ```json
    {
      "source": "aqicn.org",
      "query": "delhi",
      "city": {
        "name": "Delhi, India",
        "geo": [28.66667, 77.21667],
        "url": "https://aqicn.org/city/india/delhi/"
      },
      "aqi": {
        "value": 164,
        "label": "Unhealthy",
        "color": "#CC0033",
        "level": "unhealthy",
        "healthImplications": "Everyone may begin to experience health effects; members of sensitive groups may experience more serious health effects."
      },
      "dominantPollutant": "pm25",
      "measurements": {
        "pm25": {
          "value": 89,
          "label": "PM2.5 (fine particulate matter)",
          "unit": "µg/m³"
        }
      },
      "time": {
        "iso": "2025-11-25T11:00:00+05:30",
        "timezone": "IST"
      },
      "meta": {
        "provider": "World Air Quality Index (WAQI)",
        "apiDocs": "https://aqicn.org/api/",
        "cache": {
          "hit": false,
          "ttlMs": 300000
        }
      }
    }
    ```

  - Error shapes:
    - `400 Bad Request` – missing `city`:

      ```json
      { "error": "Missing required query parameter 'city'." }
      ```

    - `404 Not Found` – city not found / no data:

      ```json
      { "error": "No AQI data found for city 'unknowncity'." }
      ```

    - `502 Bad Gateway` – upstream API/network issue:

      ```json
      { "error": "Failed to fetch AQI data from upstream provider." }
      ```

---

### Caching behaviour (in plain English)

The AQI vendor has rate limits and network latency, so the backend keeps a small **in‑memory cache**:

- Implemented in `server/aqiService.js` using a JavaScript `Map`.
- Each entry is keyed by the normalized city name and stores:
  - The normalized AQI payload,
  - An expiry timestamp,
  - A last-accessed timestamp.
- **TTL**: 5 minutes.
- **Max entries**: 100. When this limit is hit, the oldest entry is evicted.

How it feels from the user’s perspective:

- The **first** search for a city calls WAQI, normalizes the result, stores it, and returns it.
- Subsequent searches for the same city within 5 minutes come straight from memory and are much faster.
- The JSON contains `meta.cache.hit` so the frontend can show whether a result was served from cache or fetched fresh.

---

### Frontend behaviour

On the client side (`public/app.js`), the flow is:

1. User types a city, presses **Enter** or clicks **Search**.
2. The browser calls `GET /api/aqi?city=...`.
3. The response is rendered into:
   - A **summary card** (AQI value, category, health text, dominant pollutant, last updated time, coordinates).
   - A **pollutant card** (PM2.5, PM10, O₃, NO₂, SO₂, CO, etc.) if available.
   - A small **source / attribution** section pointing back to WAQI.
4. A status bar at the top shows:
   - Loading state while the request is in flight.
   - Whether the response was a cache hit or a fresh call to the provider.

The whole thing runs locally with a single `npm start` command.  
No build step is required; it’s just plain Node.js, Express, and browser JavaScript.
