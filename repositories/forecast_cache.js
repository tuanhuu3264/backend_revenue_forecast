class ForecastCache {
  constructor() {
    this.forecast = [];
    this.insights = [];
    this.analysis = null;
    this.overallInsight = null;
    this.revenueSeries = null;
    this.updatedAt = null;
  }

  setSnapshot({
    forecast,
    insights,
    analysis,
    updatedAt,
    overallInsight,
    revenueSeries,
  }) {
    this.forecast = forecast;
    this.insights = insights;
    this.analysis = analysis;
    this.overallInsight = overallInsight ?? null;
    this.revenueSeries = revenueSeries ?? null;
    this.updatedAt = updatedAt ?? new Date().toISOString();
  }

  getSnapshot() {
    return {
      updatedAt: this.updatedAt,
      insights: this.insights,
      analysis: this.analysis,
      overallInsight: this.overallInsight,
      revenueSeries: this.revenueSeries,
      table: this.forecast,
    };
  }
}

module.exports = { ForecastCache };
