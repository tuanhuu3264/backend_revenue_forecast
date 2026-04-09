const toDate = (value) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const monthKey = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

const addMonths = (date, n) => {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
};

const formatDate = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const linearRegression = (values) => {
  const n = values.length;
  if (n < 2) return { slope: 0, intercept: values[0] || 0 };

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (let i = 0; i < n; i += 1) {
    const x = i + 1;
    const y = values[i];
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
  }

  const slope =
    (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX || Number.EPSILON);
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
};

const normalizeRows = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  return (
    payload.Data ||
    payload.data ||
    payload.Items ||
    payload.items ||
    []
  );
};

const getCumulativeAmount = (item) => {
  const raw =
    item.CumAmount ??
    item.CumValue ??
    item.cumAmount ??
    item.cumValue;
  return Number(raw);
};

const round2 = (n) => Number(Number(n).toFixed(2));

const MAX_CHART_HISTORICAL_POINTS = 2500;

/**
 * @param {any[]} rows
 * @returns {{ date: Date; cumAmount: number }[]}
 */
function getCleanedDailyRows(rows) {
  return rows
    .map((item) => ({
      date: toDate(item.DateIs),
      cumAmount: getCumulativeAmount(item),
    }))
    .filter(
      (item) =>
        item.date &&
        Number.isFinite(item.cumAmount) &&
        item.cumAmount >= 0
    )
    .sort((a, b) => a.date - b.date);
}

/**
 * @param {{ date: Date; cumAmount: number }[]} cleaned
 * @returns {{ date: string; amount: number }[]}
 */
function downsampleHistoricalPoints(cleaned) {
  if (cleaned.length === 0) return [];
  const pts = cleaned.map((c) => ({
    date: formatDate(c.date),
    amount: round2(c.cumAmount),
  }));
  if (pts.length <= MAX_CHART_HISTORICAL_POINTS) return pts;
  const step = Math.ceil(pts.length / MAX_CHART_HISTORICAL_POINTS);
  const out = [];
  for (let i = 0; i < pts.length; i += step) {
    out.push(pts[i]);
  }
  const last = pts[pts.length - 1];
  if (out[out.length - 1].date !== last.date) out.push(last);
  return out;
}

/**
 * Chuỗi lũy kế theo ngày (đã giảm mẫu) để vẽ biểu đồ lịch sử.
 * @param {any[]} rawRows
 */
function buildHistoricalSeriesForChart(rawRows) {
  try {
    const cleaned = getCleanedDailyRows(rawRows);
    return downsampleHistoricalPoints(cleaned);
  } catch {
    return [];
  }
}

/**
 * @param {any[]} rows
 * @param {{ confidencePct?: number }} [options]
 */
const runRevenueAnalysis = (rows, options = {}) => {
  const FORECAST_CONFIDENCE_PCT = options.confidencePct ?? 5;

  const cleaned = getCleanedDailyRows(rows);

  if (cleaned.length < 4) {
    throw new Error("Not enough valid records for 3-month forecasting.");
  }

  const monthlyMaxCum = new Map();
  for (const row of cleaned) {
    const key = monthKey(row.date);
    const current = monthlyMaxCum.get(key);
    if (!current || row.cumAmount > current.cumAmount) {
      monthlyMaxCum.set(key, row);
    }
  }

  const monthEntries = [...monthlyMaxCum.entries()]
    .sort((a, b) => a[1].date - b[1].date)
    .map(([, value]) => value);

  if (monthEntries.length < 4) {
    throw new Error("Not enough monthly points after cleaning.");
  }

  const monthlyIncrements = [];
  for (let i = 1; i < monthEntries.length; i += 1) {
    const inc = monthEntries[i].cumAmount - monthEntries[i - 1].cumAmount;
    monthlyIncrements.push(inc > 0 ? inc : 0);
  }

  const { slope, intercept } = linearRegression(monthlyIncrements);
  const forecast = [];
  let lastCum = monthEntries[monthEntries.length - 1].cumAmount;
  const baseDate = monthEntries[monthEntries.length - 1].date;
  const n = monthlyIncrements.length;

  for (let i = 1; i <= 3; i += 1) {
    const x = n + i;
    const predictedIncrement = Math.max(0, intercept + slope * x);
    lastCum += predictedIncrement;
    const forecastDate = addMonths(baseDate, i);
    const fd = formatDate(forecastDate);
    forecast.push({
      ForecastedDate: fd,
      ForcastedDate: fd,
      ForecastedAmount: round2(lastCum),
    });
  }

  const band = FORECAST_CONFIDENCE_PCT / 100;
  const forecastWithRange = forecast.map((f) => ({
    ForecastedDate: f.ForecastedDate,
    ForcastedDate: f.ForcastedDate,
    ForecastedAmount: f.ForecastedAmount,
    ForecastedAmountLow: round2(f.ForecastedAmount * (1 - band)),
    ForecastedAmountHigh: round2(f.ForecastedAmount * (1 + band)),
  }));

  const avgRecent =
    monthlyIncrements
      .slice(-3)
      .reduce((sum, v) => sum + v, 0) / Math.min(3, monthlyIncrements.length);
  const avgAll =
    monthlyIncrements.reduce((sum, v) => sum + v, 0) /
    monthlyIncrements.length;
  const minInc = Math.min(...monthlyIncrements);
  const maxInc = Math.max(...monthlyIncrements);
  const lastInc =
    monthlyIncrements.length > 0
      ? monthlyIncrements[monthlyIncrements.length - 1]
      : 0;

  const first = cleaned[0];
  const last = cleaned[cleaned.length - 1];
  const dateFrom = formatDate(first.date);
  const dateTo = formatDate(last.date);
  const histGrowth = last.cumAmount - first.cumAmount;
  const spanMs = Math.max(1, last.date - first.date);
  const spanDays = spanMs / 86400000;

  const analysis = {
    confidenceBandPercent: FORECAST_CONFIDENCE_PCT,
    period: { dateFrom, dateTo, spanDays: round2(spanDays) },
    counts: {
      dataPoints: cleaned.length,
      monthPoints: monthEntries.length,
    },
    cumulative: {
      first: round2(first.cumAmount),
      latestHistorical: round2(last.cumAmount),
      growthInPeriod: round2(histGrowth),
      impliedAvgPerDay: round2(histGrowth / spanDays),
    },
    monthlyIncrements: {
      averageAllMonths: round2(avgAll),
      averageLast3Months: round2(avgRecent),
      lastMonth: round2(lastInc),
      min: round2(minInc),
      max: round2(maxInc),
    },
    model: {
      name: "linear_regression_monthly_increment",
      incrementSlope: round2(slope),
      incrementIntercept: round2(intercept),
    },
    forecastWithRange,
  };

  const overallInsight =
    `Nhan xet tong quan: Chuoi doanh thu luy ke gom ${monthEntries.length} thang day du (${dateFrom} den ${dateTo}), ` +
    `tang tich luy trong ky ${round2(histGrowth)} (TB ${round2(histGrowth / spanDays)}/ngay). ` +
    `Tang theo thang: trung binh tat ca ${round2(avgAll)}, 3 thang gan nhat ${round2(avgRecent)}; bien dong thang (min–max) ${round2(minInc)}–${round2(maxInc)}. ` +
    `Du bao 3 thang tiep theo dung mo hinh tuyen tinh tren tang thang; khoang tin cay muc tieu +- ${FORECAST_CONFIDENCE_PCT}% quanh diem du bao.`;

  const insights = [
    `Du lieu: ${cleaned.length} diem ngay, ${monthEntries.length} thang day du (${dateFrom} den ${dateTo}).`,
    `Luy ke moi nhat trong lich su: ${round2(last.cumAmount)}; tang tich luy trong khoang: ${round2(histGrowth)} (trung binh ${round2(histGrowth / spanDays)}/ngay).`,
    `Tang truong theo thang: TB tat ca thang ${round2(avgAll)}, 3 thang gan nhat ${round2(avgRecent)}; thang gan nhat ${round2(lastInc)} (min-max thang: ${round2(minInc)} - ${round2(maxInc)}).`,
    `Du bao 3 thang tiep theo (luy ke) bang hoi quy tuyen tinh tren tang thang; khoang tin cay muc tieu +-${FORECAST_CONFIDENCE_PCT}% xem cot thap/cao.`,
    `Tong luy ke du bao sau 3 thang: ${round2(forecast[2].ForecastedAmount)} (nam trong khoang ${round2(forecastWithRange[2].ForecastedAmountLow)} - ${round2(forecastWithRange[2].ForecastedAmountHigh)} neu ap dung +-${FORECAST_CONFIDENCE_PCT}%).`,
  ];

  return { forecast, insights, analysis, overallInsight };
};

module.exports = {
  runRevenueAnalysis,
  normalizeRows,
  getCumulativeAmount,
  buildHistoricalSeriesForChart,
  getCleanedDailyRows,
};
