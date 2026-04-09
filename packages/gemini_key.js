const fs = require("fs");
const { beEnvPath } = require("./loadEnv");

function parseEnvFileValue(text, varName) {
  const lines = String(text).replace(/^\uFEFF/, "").split(/\r?\n/);
  const esc = varName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^\\s*${esc}\\s*=\\s*(.*)$`);
  for (const line of lines) {
    const m = line.match(re);
    if (!m) continue;
    let v = m[1].trim();
    if (!v || v.startsWith("#")) continue;
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    return v.trim();
  }
  return "";
}

let memo;

function resolveGeminiApiKey() {
  if (memo !== undefined) return memo;
  const fromEnv = (process.env.GEMINI_API_KEY || "").trim();
  if (fromEnv) {
    memo = fromEnv;
    return memo;
  }
  try {
    const raw = fs.readFileSync(beEnvPath, "utf8");
    const fromFile = parseEnvFileValue(raw, "GEMINI_API_KEY");
    memo = fromFile || "";
    return memo;
  } catch {
    memo = "";
    return memo;
  }
}

module.exports = { resolveGeminiApiKey, parseEnvFileValue };
