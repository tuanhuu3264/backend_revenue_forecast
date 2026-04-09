/**
 * @param {import("express").Express} app
 * @param {{
 *   config: object;
 *   auth: import("express").RequestHandler;
 *   authService: import("../services/auth_service").AuthService;
 *   revenueForecastService: import("../services/revenue_forecast_service").RevenueForecastService;
 * }} deps
 */
function registerRoutes(app, { config, auth, authService, revenueForecastService }) {
  app.get("/health", (_req, res) => {
    res.setHeader("X-CentralRetail-Pid", String(process.pid));
    res.setHeader("X-CentralRetail-Service", "centralretail-be");
    res.json({
      status: "ok",
      service: "centralretail-be",
      port: config.port,
      pid: process.pid,
      nodeEnv: process.env.NODE_ENV || "",
      geminiConfigured: Boolean((config.geminiApiKey || "").trim()),
    });
  });

  app.post("/api/auth/register", (req, res) => {
    try {
      const { email, password } = req.body || {};
      const result = authService.register(email, password);
      res.status(201).json(result);
    } catch (e) {
      res.status(400).json({ message: e.message || "Registration failed" });
    }
  });

  app.post("/api/auth/login", (req, res) => {
    try {
      const { email, password } = req.body || {};
      const result = authService.login(email, password);
      res.json(result);
    } catch (e) {
      res.status(401).json({ message: e.message || "Login failed" });
    }
  });

  app.get("/api/auth/me", auth, (req, res) => {
    res.json({ user: req.user });
  });

  app.get("/api/forecast", auth, async (req, res) => {
    try {
      const result = await revenueForecastService.runForecastJob({
        triggerSource: "api_forecast",
        userId: Number(req.user.id),
      });
      res.json(result);
    } catch (error) {
      res.status(500).json({
        message: "Cannot forecast data from source API.",
        error: error.message,
      });
    }
  });

  app.post("/api/agent/run", auth, async (req, res) => {
    try {
      const prompt = String(req.body?.prompt || "").trim();
      const result = await revenueForecastService.runAgent(prompt, {
        userId: Number(req.user.id),
      });
      const provider = result?.agent?.provider ?? "none";
      console.log(`[api/agent/run] pid=${process.pid} agent=${provider}`);
      res.setHeader("X-CentralRetail-Pid", String(process.pid));
      res.setHeader("X-Agent-Provider", provider);
      res.json(result);
    } catch (error) {
      res.status(500).json({
        message: "Agent execution failed.",
        error: error.message,
      });
    }
  });

  app.get("/api/forecast/latest", auth, (_req, res) => {
    res.json(revenueForecastService.getLatestSnapshot());
  });

  app.get("/api/forecast/reports", auth, (req, res) => {
    const limit = req.query.limit;
    const offset = req.query.offset;
    const triggerSource = req.query.triggerSource;
    const items = revenueForecastService.listReportHistory(
      limit,
      offset,
      triggerSource
    );
    res.json({ items });
  });

  app.get("/api/forecast/reports/:id", auth, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id < 1) {
      res.status(400).json({ message: "Invalid report id" });
      return;
    }
    const report = revenueForecastService.getReportById(id);
    if (!report) {
      res.status(404).json({ message: "Report not found" });
      return;
    }
    res.json(report);
  });
}

module.exports = { registerRoutes };
