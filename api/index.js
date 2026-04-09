/**
 * Vercel Serverless: mọi request được chuyển tới đây (xem vercel.json).
 * Lưu ý: SQLite file + cron không phù hợp serverless; MVP nên host Railway/Render.
 */
const { getApp } = require("../cmd/http_stack");

module.exports = getApp();
