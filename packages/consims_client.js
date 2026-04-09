const axios = require("axios");

function normalizeRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  return (
    payload.Data ||
    payload.data ||
    payload.Items ||
    payload.items ||
    []
  );
}

/**
 * @param {{ sourceApiUrl: string, sourceApiToken?: string }} config
 * @returns {() => Promise<any[]>}
 */
function createFetchRevenueRows(config) {
  return async function fetchRevenueRows() {
    const axiosOpts = { timeout: 20000 };
    const token = (config.sourceApiToken || "").trim();
    if (token) {
      axiosOpts.headers = { Authorization: `Bearer ${token}` };
    }
    const response = await axios.get(config.sourceApiUrl, axiosOpts);
    return normalizeRows(response.data);
  };
}

module.exports = { createFetchRevenueRows };
