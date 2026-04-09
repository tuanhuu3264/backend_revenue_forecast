const path = require("path");

/**
 * Monorepo: root .env (cùng cấp thư mục BE/) rồi BE/.env.
 * Thứ tự: root trước → BE sau (override: true để trùng key thì BE thắng).
 */
const rootEnvPath = path.resolve(__dirname, "..", "..", ".env");
const beEnvPath = path.resolve(__dirname, "..", ".env");

function loadEnvFile(filePath) {
  return require("dotenv").config({ path: filePath, override: true });
}

const rootResult = loadEnvFile(rootEnvPath);
const beResult = loadEnvFile(beEnvPath);

if (rootResult.error && rootResult.error.code !== "ENOENT") {
  console.warn("[env] Loi doc root .env:", rootResult.error.message);
}
if (beResult.error && beResult.error.code !== "ENOENT") {
  console.warn("[env] Loi doc BE/.env:", beResult.error.message);
}

if (process.env.NODE_ENV !== "production") {
  if (!rootResult.error) {
    console.log("[env] Da load root:", rootEnvPath);
  }
  if (!beResult.error) {
    console.log("[env] Da load BE:", beEnvPath);
  }
  if (rootResult.error?.code === "ENOENT") {
    console.log("[env] Khong co file root (bo qua):", rootEnvPath);
  }
  if (beResult.error?.code === "ENOENT") {
    console.warn(`[env] Khong tim thay BE/.env: ${beEnvPath}`);
  }
}
{
  const g = (process.env.GEMINI_API_KEY || "").trim();
  console.log(
    "[env] GEMINI_API_KEY:",
    g ? "co (da nap)" : "TRONG — them vao BE/.env hoac root .env; restart BE"
  );
}

module.exports = { envPath: beEnvPath, rootEnvPath, beEnvPath };
