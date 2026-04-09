class ForecastReportRepository {
  /**
   * @param {import("better-sqlite3").Database} db
   */
  constructor(db) {
    this.db = db;
    this.insertStmt = db.prepare(`
      INSERT INTO forecast_reports (
        created_at, trigger_source, user_id, prompt, agent_provider,
        forecast_json, insights_json, analysis_json, overall_insight,
        revenue_series_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    this.listStmt = db.prepare(`
      SELECT id, created_at, trigger_source, user_id, prompt, agent_provider
      FROM forecast_reports
      ORDER BY id DESC
      LIMIT ? OFFSET ?
    `);
    this.listByTriggerStmt = db.prepare(`
      SELECT id, created_at, trigger_source, user_id, prompt, agent_provider
      FROM forecast_reports
      WHERE trigger_source = ?
      ORDER BY id DESC
      LIMIT ? OFFSET ?
    `);
    this.getByIdStmt = db.prepare(`
      SELECT * FROM forecast_reports WHERE id = ?
    `);
  }

  /**
   * @param {{
   *   createdAt: string;
   *   triggerSource: string;
   *   userId: number | null;
   *   prompt: string | null;
   *   agentProvider: string | null;
   *   forecast: unknown[];
   *   insights: unknown[];
   *   analysis: unknown | null;
   *   overallInsight: string | null;
   *   revenueSeries?: unknown | null;
   * }} row
   */
  insert(row) {
    const info = this.insertStmt.run(
      row.createdAt,
      row.triggerSource,
      row.userId,
      row.prompt,
      row.agentProvider,
      JSON.stringify(row.forecast ?? []),
      JSON.stringify(row.insights ?? []),
      row.analysis == null ? null : JSON.stringify(row.analysis),
      row.overallInsight,
      row.revenueSeries == null
        ? null
        : JSON.stringify(row.revenueSeries)
    );
    return Number(info.lastInsertRowid);
  }

  /**
   * @param {number} limit
   * @param {number} offset
   */
  /**
   * @param {number} limit
   * @param {number} offset
   * @param {string} [triggerSource] e.g. "cron"
   */
  list(limit, offset, triggerSource) {
    const ts = triggerSource && String(triggerSource).trim();
    const rows = ts
      ? this.listByTriggerStmt.all(ts, limit, offset)
      : this.listStmt.all(limit, offset);
    return rows.map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      triggerSource: row.trigger_source,
      userId: row.user_id,
      prompt: row.prompt,
      agentProvider: row.agent_provider,
    }));
  }

  /**
   * @param {number} id
   */
  getById(id) {
    const row = this.getByIdStmt.get(id);
    if (!row) return null;
    return {
      id: row.id,
      createdAt: row.created_at,
      triggerSource: row.trigger_source,
      userId: row.user_id,
      prompt: row.prompt,
      agentProvider: row.agent_provider,
      forecast: safeJsonParse(row.forecast_json, []),
      insights: safeJsonParse(row.insights_json, []),
      analysis: row.analysis_json ? safeJsonParse(row.analysis_json, null) : null,
      overallInsight: row.overall_insight,
      revenueSeries: row.revenue_series_json
        ? safeJsonParse(row.revenue_series_json, null)
        : null,
    };
  }
}

function safeJsonParse(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

module.exports = { ForecastReportRepository };
