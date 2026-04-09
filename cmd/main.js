const cron = require("node-cron");

const { config } = require("../packages/config");
const { beEnvPath } = require("../packages/loadEnv");
const { getApp, getRevenueForecastService } = require("./http_stack");

const FORECAST_CRON_SCHEDULE = "0 8 * * *";

const app = getApp();

console.log(
  `[boot] NODE_ENV=${process.env.NODE_ENV || "(unset)"} port=${config.port} pid=${process.pid} gemini=${(config.geminiApiKey || "").trim() ? "yes" : "NO"}`
);
if (!(config.geminiApiKey || "").trim()) {
  console.warn(
    `[boot] Khong co GEMINI_API_KEY (dotenv + doc file). Kiem tra: ${beEnvPath}`
  );
}

const revenueForecastService = getRevenueForecastService();

cron.schedule(FORECAST_CRON_SCHEDULE, async () => {
  try {
    await revenueForecastService.runForecastJob({ triggerSource: "cron" });
    console.log(`[CRON] Forecast updated at ${new Date().toISOString()}`);
  } catch (error) {
    console.error("[CRON] Forecast update failed:", error.message);
  }
});

app.listen(config.port, () => {
  console.log(`BE server is running on http://localhost:${config.port}`);
  if (config.jwtSecret === "dev-only-change-me") {
    console.warn(
      "[auth] Using default JWT_SECRET. Set JWT_SECRET in .env for production."
    );
  }
  if (config.geminiApiKey) {
    console.log(`Gemini agent enabled (model: ${config.geminiModel})`);
  } else {
    console.log("Gemini agent disabled: set GEMINI_API_KEY in .env");
  }
});
