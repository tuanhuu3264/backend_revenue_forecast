
const http = require("http");

const { config } = require("../packages/config");
const { rootEnvPath, beEnvPath } = require("../packages/loadEnv");

function probeHealth(port) {
  return new Promise((resolve) => {
    const req = http.get(
      { hostname: "127.0.0.1", port, path: "/health", timeout: 2500 },
      (res) => {
        let raw = "";
        res.on("data", (c) => {
          raw += c;
        });
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(raw), headers: res.headers });
          } catch {
            resolve({ status: res.statusCode, body: null, headers: res.headers });
          }
        });
      }
    );
    req.on("error", () => resolve(null));
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
  });
}

async function main() {
  const geminiFromFile = Boolean((config.geminiApiKey || "").trim());

  console.log("=== CentralRetail BE — verify setup ===\n");
  console.log("File root .env:", rootEnvPath);
  console.log("File BE/.env:   ", beEnvPath);
  console.log("config.port:    ", config.port);
  console.log(
    "GEMINI (sau loadEnv):",
    geminiFromFile ? "co (se dung Gemini neu day la process BE)" : "TRONG -> POST /api/agent/run = rule-only"
  );
  console.log("");

  const live = await probeHealth(config.port);
  if (!live || !live.body) {
    console.log(
      "GET /health: khong ket noi duoc (127.0.0.1:" +
        config.port +
        "). Start BE: npm start — roi chay lai script nay."
    );
    process.exit(geminiFromFile ? 0 : 1);
  }

  const h = live.body;
  if (!h || typeof h !== "object" || h.service !== "centralretail-be") {
    console.log(
      "GET /health HTTP",
      live.status,
      "— khong phai CentralRetail BE (can `service: centralretail-be`)."
    );
    console.log("  Body:", JSON.stringify(h).slice(0, 300));
    console.log(
      "  -> Port",
      config.port,
      "dang co process khac; tat process do hoac doi PORT trong .env."
    );
    process.exit(1);
  }

  console.log("GET /health (process dang listen):");
  console.log("  service:           ", h.service);
  console.log("  pid:               ", h.pid);
  console.log("  geminiConfigured:  ", h.geminiConfigured);
  console.log("  header X-CentralRetail-Pid:", live.headers["x-centralretail-pid"] || "(none)");

  if (h.geminiConfigured !== geminiFromFile) {
    console.log(
      "\nCANH BAO: geminiConfigured tren /health khac voi config trong process script nay."
    );
    console.log(
      "  -> Hai process Node khac nhau, hoac BE chua restart sau khi sua .env."
    );
    process.exit(1);
  }

  if (!geminiFromFile) {
    console.log(
      "\n=> Them GEMINI_API_KEY vao BE/.env (hoac root .env), restart BE."
    );
    process.exit(1);
  }

  console.log("\n=> OK: env file va /health thong nhat; POST /api/agent/run se co the tra agent=germini (neu API OK).");
  console.log("   DevTools: Response Headers cua POST /api/agent/run co X-Agent-Provider = gemini | fallback | rule-only.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
