const cityInput = document.getElementById("city-input");
const searchBtn = document.getElementById("search-btn");
const statusBar = document.getElementById("status-bar");
const statusText = document.getElementById("status-text");
const resultsSection = document.getElementById("results");

const cityNameEl = document.getElementById("city-name");
const aqiCategoryEl = document.getElementById("aqi-category");
const aqiValueEl = document.getElementById("aqi-value");
const aqiLabelEl = document.getElementById("aqi-label");
const aqiHealthEl = document.getElementById("aqi-health");
const dominantPolEl = document.getElementById("dominant-pol");
const updatedAtEl = document.getElementById("updated-at");
const cityGeoEl = document.getElementById("city-geo");

const pollutantsListEl = document.getElementById("pollutants-list");
const pollutantsEmptyEl = document.getElementById("pollutants-empty");

const attributionsEl = document.getElementById("attributions");

function setStatus(message, type = "neutral", show = true) {
  if (!show) {
    statusBar.classList.add("hidden");
    statusBar.classList.remove("loading", "error", "ok");
    statusText.textContent = "";
    return;
  }
  statusBar.classList.remove("hidden", "loading", "error", "ok");
  statusBar.classList.add(type === "loading" ? "loading" : type === "error" ? "error" : "ok");
  statusText.textContent = message;
}

function formatDateTime(isoString, timezone) {
  if (!isoString) return "Unknown";
  try {
    const d = new Date(isoString);
    const options = {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    };
    const base = d.toLocaleString(undefined, options);
    return timezone ? `${base} (${timezone})` : base;
  } catch {
    return isoString;
  }
}

function applyAqiColor(category) {
  if (!category || !category.color) return;
  const color = category.color;
  const chipStyle = `
    background: rgba(15, 23, 42, 0.96);
    color: ${color};
    border: 1px solid ${color};
  `;
  aqiCategoryEl.style = chipStyle;
}

function renderPollutants(measurements) {
  pollutantsListEl.innerHTML = "";
  const keys = Object.keys(measurements || {});
  if (!keys.length) {
    pollutantsEmptyEl.classList.remove("hidden");
    return;
  }

  pollutantsEmptyEl.classList.add("hidden");
  keys.forEach((key) => {
    const m = measurements[key];
    const pill = document.createElement("div");
    pill.className = "pollutant-pill";
    pill.innerHTML = `
      <div class="pollutant-label">${m.label}</div>
      <div class="pollutant-value">${m.value.toFixed(1)}</div>
      <div class="pollutant-unit">${m.unit || ""}</div>
    `;
    pollutantsListEl.appendChild(pill);
  });
}

function renderAttributions(attributions = []) {
  attributionsEl.innerHTML = "";
  if (!attributions.length) return;
  attributions.forEach((attr) => {
    const li = document.createElement("li");
    const name = attr.name || "Attribution";
    if (attr.url) {
      li.innerHTML = `<a href="${attr.url}" target="_blank" rel="noopener noreferrer">${name}</a>`;
    } else {
      li.textContent = name;
    }
    attributionsEl.appendChild(li);
  });
}

function renderResult(data) {
  if (!data) return;
  const { city, aqi, dominantPollutant, measurements, time, attribution, meta } = data;

  cityNameEl.textContent = city?.name || data.query || "Unknown city";
  aqiValueEl.textContent = aqi?.value ?? "–";
  aqiLabelEl.textContent = aqi?.label || "Unknown";
  aqiHealthEl.textContent = aqi?.healthImplications || "";
  dominantPolEl.textContent = dominantPollutant || "N/A";
  updatedAtEl.textContent = formatDateTime(time?.iso, time?.timezone);

  if (city?.geo && Array.isArray(city.geo) && city.geo.length === 2) {
    cityGeoEl.textContent = `${city.geo[0].toFixed(3)}, ${city.geo[1].toFixed(3)}`;
  } else {
    cityGeoEl.textContent = "Not available";
  }

  applyAqiColor(aqi);
  renderPollutants(measurements);
  renderAttributions(attribution);

  // Status message about cache
  if (meta && meta.cache) {
    const { hit } = meta.cache;
    setStatus(
      hit
        ? `Loaded from cache for "${data.query}".`
        : `Fetched fresh data for "${data.query}".`,
      "ok",
      true
    );
  } else {
    setStatus(`Loaded AQI data for "${data.query}".`, "ok", true);
  }

  resultsSection.classList.remove("hidden");
}

async function fetchAqi(city) {
  const trimmed = city.trim();
  if (!trimmed) {
    setStatus("Please enter a city name.", "error", true);
    resultsSection.classList.add("hidden");
    return;
  }

  searchBtn.disabled = true;
  setStatus(`Searching AQI for "${trimmed}"...`, "loading", true);

  try {
    const res = await fetch(`/api/aqi?city=${encodeURIComponent(trimmed)}`);
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const message =
        errBody && errBody.error
          ? errBody.error
          : `Request failed with status ${res.status}`;
      throw new Error(message);
    }
    const data = await res.json();
    renderResult(data);
  } catch (err) {
    console.error(err);
    setStatus(err.message || "Failed to fetch AQI data.", "error", true);
  } finally {
    searchBtn.disabled = false;
  }
}

searchBtn.addEventListener("click", () => {
  fetchAqi(cityInput.value || "");
});

cityInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    fetchAqi(cityInput.value || "");
  }
});

// Optional: pre-populate with a commonly known city
window.addEventListener("DOMContentLoaded", () => {
  cityInput.focus();
});


