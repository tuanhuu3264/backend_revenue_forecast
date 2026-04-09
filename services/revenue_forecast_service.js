const {
  runRevenueAnalysis,
  buildHistoricalSeriesForChart,
} = require("./revenue_analysis");

/**
 * @param {any[]} forecast
 * @param {any} analysis
 */
function buildForecastChartPoints(forecast, analysis) {
  return (forecast || []).map((r, i) => ({
    date: r.ForcastedDate || r.ForecastedDate,
    amount: Number(r.ForecastedAmount),
    low: analysis?.forecastWithRange?.[i]?.ForecastedAmountLow,
    high: analysis?.forecastWithRange?.[i]?.ForecastedAmountHigh,
  }));
}

/**
 * @param {any[]} sourceData
 * @param {any[]} forecast
 * @param {any} analysis
 */
function buildRevenueSeriesBundle(sourceData, forecast, analysis) {
  return {
    historical: buildHistoricalSeriesForChart(sourceData),
    forecast: buildForecastChartPoints(forecast, analysis),
  };
}

class RevenueForecastService {
  /**
   * @param {object} deps
   * @param {object} deps.config
   * @param {import("../repositories/forecast_cache").ForecastCache} deps.cache
   * @param {import("../repositories/forecast_report_repository").ForecastReportRepository} deps.reportRepository
   * @param {() => Promise<any[]>} deps.fetchRows
   * @param {Function} deps.runGeminiRevenueAgent
   */
  constructor({ config, cache, reportRepository, fetchRows, runGeminiRevenueAgent }) {
    this.config = config;
    this.cache = cache;
    this.reportRepository = reportRepository;
    this.fetchRows = fetchRows;
    this.runGeminiRevenueAgent = runGeminiRevenueAgent;
  }

  analysisOptions() {
    return { confidencePct: this.config.forecastConfidencePct };
  }

  /**
   * @param {{
   *   triggerSource?: string;
   *   userId?: number | null;
   *   prompt?: string | null;
   *   agentProvider?: string | null;
   * }} [ctx]
   */
  async runForecastJob(ctx = {}) {
    const {
      triggerSource = "api_forecast",
      userId = null,
      prompt = null,
      agentProvider = null,
    } = ctx;

    const sourceData = await this.fetchRows();

    let forecast = [];
    let insights = [];
    let analysis = null;
    let overallInsight = null;
    if (sourceData.length >= 4) {
      const result = runRevenueAnalysis(sourceData, this.analysisOptions());
      forecast = result.forecast;
      insights = result.insights;
      analysis = result.analysis;
      overallInsight = result.overallInsight ?? null;
    } else {
      insights = [
        "API nguon chua co du lieu du de du bao 3 thang.",
        "Can toi thieu 4 ban ghi hop le (DateIs + CumAmount hoac CumValue).",
        "He thong tra ve bang rong de tranh du bao sai.",
        "Bien do sai so muc tieu: +-5% (ap dung khi co du lieu du).",
      ];
    }

    const revenueSeries = buildRevenueSeriesBundle(
      sourceData,
      forecast,
      analysis
    );

    const updatedAt = new Date().toISOString();
    this.cache.setSnapshot({
      forecast,
      insights,
      analysis,
      updatedAt,
      overallInsight,
      revenueSeries,
    });

    this.reportRepository.insert({
      createdAt: updatedAt,
      triggerSource,
      userId,
      prompt,
      agentProvider,
      forecast,
      insights,
      analysis,
      overallInsight,
      revenueSeries,
    });

    return {
      forecast,
      insights,
      analysis,
      updatedAt,
      overallInsight,
      revenueSeries,
    };
  }

  /**
   * @param {string} prompt
   * @param {{ userId?: number | null }} [ctx]
   */
  async runAgent(prompt, ctx = {}) {
    const userId = ctx.userId ?? null;
    const apiKey = (this.config.geminiApiKey || "").trim();
    if (!apiKey) {
      const result = await this.runForecastJob({
        triggerSource: "api_agent",
        userId,
        prompt: prompt || null,
        agentProvider: "no_gemini_key",
      });
      return {
        prompt,
        responseType: "table+insight+json",
        ...result,
        table: result.forecast,
        agent: {
          provider: "fallback",
          model: this.config.geminiModel,
          reason: "GEMINI_API_KEY not configured",
        },
      };
    }

    try {
      const agentResult = await this.runGeminiRevenueAgent({
        apiKey,
        model: this.config.geminiModel,
        userPrompt: prompt,
        fetchRows: this.fetchRows,
        computeAnalysis: runRevenueAnalysis,
        analysisOptions: this.analysisOptions(),
      });

      let { forecast, insights, geminiText, analysis, overallInsight } =
        agentResult;

      if (!analysis || forecast.length === 0) {
        try {
          const rows = await this.fetchRows();
          if (rows.length >= 4) {
            const full = runRevenueAnalysis(rows, this.analysisOptions());
            if (!analysis) {
              analysis = full.analysis;
            }
            if (!overallInsight && full.overallInsight) {
              overallInsight = full.overallInsight;
            }
            if (forecast.length === 0) {
              forecast = full.forecast;
              if (insights.length === 0) {
                insights = full.insights;
              }
            }
          }
        } catch (postErr) {
          console.error("Post-agent analysis:", postErr.message);
        }
      }

      if (insights.length === 0 && forecast.length === 0) {
        insights = [
          "Khong du du lieu de du bao hoac Gemini chua tra insight.",
          "Kiem tra GEMINI_API_KEY va log server.",
        ];
      }

      let sourceRows = [];
      try {
        sourceRows = await this.fetchRows();
      } catch (e) {
        console.error("fetchRows for revenueSeries:", e.message);
      }
      const revenueSeries = buildRevenueSeriesBundle(
        sourceRows,
        forecast,
        analysis
      );

      const updatedAt = new Date().toISOString();
      this.cache.setSnapshot({
        forecast,
        insights,
        analysis,
        updatedAt,
        overallInsight,
        revenueSeries,
      });

      this.reportRepository.insert({
        createdAt: updatedAt,
        triggerSource: "api_agent",
        userId,
        prompt: prompt || null,
        agentProvider: "gemini",
        forecast,
        insights,
        analysis,
        overallInsight,
        revenueSeries,
      });

      return {
        prompt,
        responseType: "table+insight+json",
        forecast,
        insights,
        analysis,
        updatedAt,
        table: forecast,
        overallInsight: overallInsight || undefined,
        revenueSeries,
        agent: { provider: "gemini", model: this.config.geminiModel },
        aiNarrative: geminiText || undefined,
      };
    } catch (geminiErr) {
      console.error("Gemini agent error:", geminiErr.message);
      const result = await this.runForecastJob({
        triggerSource: "api_agent",
        userId,
        prompt: prompt || null,
        agentProvider: "fallback_after_error",
      });
      return {
        prompt,
        responseType: "table+insight+json",
        ...result,
        table: result.forecast,
        agent: {
          provider: "fallback",
          model: this.config.geminiModel,
          reason: geminiErr.message,
        },
      };
    }
  }

  getLatestSnapshot() {
    return this.cache.getSnapshot();
  }

  /**
   * @param {number} limit
   * @param {number} offset
   */
  listReportHistory(limit, offset, triggerSource) {
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    const ts =
      triggerSource === undefined || triggerSource === null
        ? undefined
        : String(triggerSource);
    return this.reportRepository.list(safeLimit, safeOffset, ts);
  }

  /**
   * @param {number} id
   */
  getReportById(id) {
    return this.reportRepository.getById(id);
  }
}

module.exports = { RevenueForecastService };
