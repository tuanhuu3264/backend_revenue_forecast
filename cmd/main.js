const express = require("express");
const cors = require("cors");
const cron = require("node-cron");

const { config } = require("../packages/config");
const { beEnvPath } = require("../packages/loadEnv");
const { createFetchRevenueRows } = require("../packages/consims_client");
const { runGeminiRevenueAgent } = require("../packages/gemini_agent");
const { openDatabase } = require("../repositories/sqlite_db");
const { UserRepository } = require("../repositories/user_repository");
const { ForecastReportRepository } = require("../repositories/forecast_report_repository");
const { ForecastCache } = require("../repositories/forecast_cache");
const { AuthService } = require("../services/auth_service");
const { RevenueForecastService } = require("../services/revenue_forecast_service");
const { requireJwt } = require("../middleware/jwt");
const { registerRoutes } = require("../controllers/routes");

const FORECAST_CRON_SCHEDULE = "0 8 * * *";

function buildApp() {
  const db = openDatabase(config.sqlitePath);
  const userRepository = new UserRepository(db);
  const authService = new AuthService({ config, userRepository });

  const cache = new ForecastCache();
  const reportRepository = new ForecastReportRepository(db);
  const fetchRows = createFetchRevenueRows(config);
  const revenueForecastService = new RevenueForecastService({
    config,
    cache,
    reportRepository,
    fetchRows,
    runGeminiRevenueAgent,
  });

  return { authService, revenueForecastService };
}

const { authService, revenueForecastService } = buildApp();
const auth = requireJwt(config);

console.log(
  `[boot] NODE_ENV=${process.env.NODE_ENV || "(unset)"} port=${config.port} pid=${process.pid} gemini=${(config.geminiApiKey || "").trim() ? "yes" : "NO"}`
);
if (!(config.geminiApiKey || "").trim()) {
  console.warn(
    `[boot] Khong co GEMINI_API_KEY (dotenv + doc file). Kiem tra: ${beEnvPath}`
  );
}

const app = express();
app.use(cors());
app.use(express.json());

registerRoutes(app, { config, auth, authService, revenueForecastService });

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
