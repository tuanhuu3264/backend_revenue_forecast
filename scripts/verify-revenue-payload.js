/**
 * Kiem tra normalizeRows + runRevenueAnalysis voi payload giong API (Success, TotalRows, Data).
 * Chay: node scripts/verify-revenue-payload.js
 */
const {
  normalizeRows,
  runRevenueAnalysis,
} = require("../services/revenue_analysis");

function assert(name, cond) {
  if (!cond) {
    console.error("FAIL:", name);
    process.exit(1);
  }
  console.log("OK:", name);
}

// 1) Payload day du nhu API user
const apiLike = {
  Success: "true",
  TotalRows: 1623,
  Data: [
    { DateIs: "2026-01-15", CumValue: 10 },
    { DateIs: "2026-02-10", CumValue: 25 },
    { DateIs: "2026-03-05", CumValue: 40 },
    { DateIs: "2026-04-01", CumValue: 55 },
    { DateIs: "2026-05-01", CumValue: 70 },
  ],
};

const rows = normalizeRows(apiLike);
assert("normalizeRows lay Data", rows.length === 5);

const result = runRevenueAnalysis(rows, { confidencePct: 5 });
assert("forecast 3 thang", result.forecast.length === 3);
assert("co analysis.forecastWithRange", result.analysis.forecastWithRange.length === 3);
assert(
  "ForecastedDate + ForcastedDate alias",
  result.forecast[0].ForecastedDate === result.forecast[0].ForcastedDate &&
    Boolean(result.forecast[0].ForecastedDate)
);
assert(
  "forecastWithRange co ForecastedDate",
  result.analysis.forecastWithRange[0].ForecastedDate ===
    result.forecast[0].ForecastedDate
);

// 2) Chi 2 ban ghi -> loi du kien
const tiny = { Success: "true", TotalRows: 2, Data: apiLike.Data.slice(0, 2) };
let threw = false;
try {
  runRevenueAnalysis(normalizeRows(tiny));
} catch (e) {
  threw = true;
  assert(
    "it nhat 4 ban ghi",
    String(e.message).includes("Not enough valid records")
  );
}
assert("2 rows throw", threw);

// 3) Success boolean (neu API tra boolean)
const boolSuccess = { Success: true, Data: apiLike.Data };
assert("Success boolean van ok", normalizeRows(boolSuccess).length === 5);

console.log("\nSample forecast[0] (ForecastedDate chuan):", {
  ForecastedDate: result.forecast[0].ForecastedDate,
  ForcastedDate: result.forecast[0].ForcastedDate,
  ForecastedAmount: result.forecast[0].ForecastedAmount,
});
console.log("verify-revenue-payload: all checks passed.");
