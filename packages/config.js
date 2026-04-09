const path = require("path");
require("./loadEnv");
const { resolveGeminiApiKey } = require("./gemini_key");

function resolveSqlitePath() {
  const raw = (process.env.SQLITE_PATH || "").trim();
  const onVercel = process.env.VERCEL === "1";
  if (onVercel) {
    if (raw && path.isAbsolute(raw) && raw.startsWith("/tmp")) {
      return raw;
    }
    return "/tmp/centralretail.db";
  }
  return raw || "data/app.db";
}

const config = {
  port: Number(process.env.PORT) || 3001,
  sourceApiUrl:
    process.env.SOURCE_API_URL || "https://consims.com/api/get-data-test",
  sourceApiToken: (process.env.SOURCE_API_TOKEN || "").trim(),
  geminiModel: process.env.GEMINI_MODEL || "gemini-2.0-flash",
  forecastConfidencePct: Number(process.env.FORECAST_CONFIDENCE_PCT) || 5,
  jwtSecret: process.env.JWT_SECRET || "dev-only-change-me",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  sqlitePath: resolveSqlitePath(),
};

Object.defineProperty(config, "geminiApiKey", {
  enumerable: true,
  configurable: true,
  get() {
    return resolveGeminiApiKey();
  },
});

module.exports = { config };
