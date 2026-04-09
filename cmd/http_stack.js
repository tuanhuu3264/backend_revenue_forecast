const express = require("express");
const cors = require("cors");

const { config } = require("../packages/config");
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

function buildServices() {
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

let cached;

/**
 * Một instance cho process (local server hoặc mỗi lambda Vercel).
 */
function getStack() {
  if (!cached) {
    const { authService, revenueForecastService } = buildServices();
    const auth = requireJwt(config);
    const app = express();
    app.use(cors());
    app.use(express.json());
    registerRoutes(app, { config, auth, authService, revenueForecastService });
    cached = { app, revenueForecastService };
  }
  return cached;
}

function getApp() {
  return getStack().app;
}

function getRevenueForecastService() {
  return getStack().revenueForecastService;
}

module.exports = { getApp, getRevenueForecastService, getStack };
