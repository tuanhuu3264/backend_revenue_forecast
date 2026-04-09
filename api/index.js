
let app;
function getLazyApp() {
  if (!app) {
    const { getApp } = require("../cmd/http_stack");
    app = getApp();
  }
  return app;
}

module.exports = (req, res) => {
  try {
    return getLazyApp()(req, res);
  } catch (err) {
    console.error("[vercel api]", err);
    if (!res.headersSent) {
      res.status(500).json({
        message: err instanceof Error ? err.message : "Server initialization failed",
      });
    }
  }
};
