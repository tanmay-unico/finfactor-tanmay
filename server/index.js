import express from "express";
import cors from "cors";
import morgan from "morgan";
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { getCityAqi } from "./aqiService.js";

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Basic middleware
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

// Serve static frontend from /public
const publicDir = path.join(__dirname, "..", "public");
app.use(express.static(publicDir));

/**
 * Health check endpoint
 */
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    message: "Air Quality Search API is running",
  });
});

/**
 * GET /api/aqi?city={cityName}
 *
 * Returns normalized AQI information for the given city.
 */
app.get("/api/aqi", async (req, res) => {
  const city = (req.query.city || "").toString().trim();

  if (!city) {
    return res.status(400).json({
      error: "Missing required query parameter 'city'.",
    });
  }

  try {
    const data = await getCityAqi(city);
    if (!data) {
      return res.status(404).json({
        error: `No AQI data found for city '${city}'.`,
      });
    }

    res.json(data);
  } catch (err) {
    console.error("Error in /api/aqi:", err);
    res.status(502).json({
      error: "Failed to fetch AQI data from upstream provider.",
    });
  }
});

// Fallback – serve index.html for any other route (SPA-style)
app.get("*", (req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Air Quality Search server listening on http://localhost:${PORT}`);
});


