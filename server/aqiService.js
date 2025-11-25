import fetch from "node-fetch";

const AQICN_BASE_URL = "https://api.waqi.info";

// Cache configuration
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_ENTRIES = 100;

/**
 * Simple in-memory LRU-like cache using Map.
 * Key: normalized city name
 * Value: { data, expiresAt, lastAccessed }
 */
const cache = new Map();

const normalizeCityKey = (city) => city.trim().toLowerCase();

function getAqiCategory(aqi) {
  if (aqi == null || Number.isNaN(aqi)) {
    return {
      label: "Unknown",
      color: "#9E9E9E",
      level: "unknown",
      healthImplications: "Air quality data is not available.",
    };
  }

  const value = Number(aqi);

  if (value <= 50) {
    return {
      label: "Good",
      color: "#009966",
      level: "good",
      healthImplications:
        "Air quality is considered satisfactory, and air pollution poses little or no risk.",
    };
  } else if (value <= 100) {
    return {
      label: "Moderate",
      color: "#FFDE33",
      level: "moderate",
      healthImplications:
        "Air quality is acceptable; however, for some pollutants there may be a moderate health concern for a very small number of people.",
    };
  } else if (value <= 150) {
    return {
      label: "Unhealthy for Sensitive Groups",
      color: "#FF9933",
      level: "usg",
      healthImplications:
        "Members of sensitive groups may experience health effects. The general public is not likely to be affected.",
    };
  } else if (value <= 200) {
    return {
      label: "Unhealthy",
      color: "#CC0033",
      level: "unhealthy",
      healthImplications:
        "Everyone may begin to experience health effects; members of sensitive groups may experience more serious health effects.",
    };
  } else if (value <= 300) {
    return {
      label: "Very Unhealthy",
      color: "#660099",
      level: "very-unhealthy",
      healthImplications:
        "Health warnings of emergency conditions. The entire population is more likely to be affected.",
    };
  }

  return {
    label: "Hazardous",
    color: "#7E0023",
    level: "hazardous",
    healthImplications:
      "Health alert: everyone may experience more serious health effects.",
  };
}

/**
 * Transform raw AQICN response to a clean, frontend-friendly shape.
 */
function normalizeAqicnResponse(raw, cityQuery) {
  if (!raw || raw.status !== "ok" || !raw.data) {
    return null;
  }

  const d = raw.data;
  const aqi = typeof d.aqi === "number" ? d.aqi : null;
  const category = getAqiCategory(aqi);

  const measurements = {};
  if (d.iaqi) {
    for (const [key, val] of Object.entries(d.iaqi)) {
      const value = val && typeof val.v === "number" ? val.v : null;
      if (value == null) continue;

      let label = key.toUpperCase();
      let pollutantName = key.toLowerCase();

      switch (pollutantName) {
        case "pm25":
          label = "PM2.5 (fine particulate matter)";
          break;
        case "pm10":
          label = "PM10 (coarse particulate matter)";
          break;
        case "o3":
          label = "Ozone (O₃)";
          break;
        case "no2":
          label = "Nitrogen Dioxide (NO₂)";
          break;
        case "so2":
          label = "Sulfur Dioxide (SO₂)";
          break;
        case "co":
          label = "Carbon Monoxide (CO)";
          break;
        default:
          label = pollutantName.toUpperCase();
      }

      measurements[pollutantName] = {
        value,
        label,
        unit: "µg/m³",
      };
    }
  }

  return {
    source: "aqicn.org",
    query: cityQuery,
    city: {
      name: d.city && d.city.name ? d.city.name : cityQuery,
      geo: d.city && d.city.geo ? d.city.geo : null,
      url: d.city && d.city.url ? d.city.url : null,
    },
    aqi: {
      value: aqi,
      ...category,
    },
    dominantPollutant: d.dominentpol || null,
    measurements,
    time: {
      iso: d.time && d.time.iso ? d.time.iso : null,
      timezone: d.time && d.time.tz ? d.time.tz : null,
      raw: d.time || null,
    },
    attribution: d.attributions || [],
    meta: {
      provider: "World Air Quality Index (WAQI)",
      apiDocs: "https://aqicn.org/api/",
    },
  };
}

function evictIfNeeded() {
  if (cache.size <= MAX_CACHE_ENTRIES) return;
  // Map preserves insertion order; first entry is oldest.
  const oldestKey = cache.keys().next().value;
  if (oldestKey) {
    cache.delete(oldestKey);
  }
}

function getFromCache(city) {
  const key = normalizeCityKey(city);
  const entry = cache.get(key);
  const now = Date.now();

  if (!entry) return null;
  if (entry.expiresAt <= now) {
    cache.delete(key);
    return null;
  }

  // Touch for LRU-like behavior: re-insert
  cache.delete(key);
  cache.set(key, { ...entry, lastAccessed: now });
  return entry.data;
}

function setInCache(city, data) {
  const key = normalizeCityKey(city);
  const now = Date.now();
  const entry = {
    data,
    expiresAt: now + CACHE_TTL_MS,
    lastAccessed: now,
  };
  cache.set(key, entry);
  evictIfNeeded();
}

/**
 * Fetch AQI data for a city, using cache and AQICN API.
 */
export async function getCityAqi(city) {
  const cached = getFromCache(city);
  if (cached) {
    return {
      ...cached,
      meta: {
        ...cached.meta,
        cache: {
          hit: true,
          ttlMs: CACHE_TTL_MS,
        },
      },
    };
  }

  const token = process.env.AQICN_API_TOKEN;
  if (!token) {
    throw new Error(
      "Missing AQICN_API_TOKEN environment variable. Please set your API token."
    );
  }

  const url = `${AQICN_BASE_URL}/feed/${encodeURIComponent(city)}/?token=${encodeURIComponent(
    token
  )}`;

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
    timeout: 8000,
  });

  if (!response.ok) {
    throw new Error(
      `AQICN API request failed with status ${response.status}: ${response.statusText}`
    );
  }

  const raw = await response.json();

  if (raw.status !== "ok") {
    // Cache negative responses for a shorter duration could be a future optimization.
    return null;
  }

  const normalized = normalizeAqicnResponse(raw, city);
  if (normalized) {
    setInCache(city, normalized);
  }

  return {
    ...normalized,
    meta: {
      ...normalized.meta,
      cache: {
        hit: false,
        ttlMs: CACHE_TTL_MS,
      },
    },
  };
}


