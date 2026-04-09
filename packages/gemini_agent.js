const {
  GoogleGenerativeAI,
  FunctionCallingMode,
  SchemaType,
} = require("@google/generative-ai");

const MAX_TOOL_TURNS = 12;

const textToInsightLines = (text) => {
  if (!text || !String(text).trim()) return [];
  return String(text)
    .split(/\n+/)
    .map((line) => line.replace(/^[-*•\d.)]+\s*/u, "").trim())
    .filter(Boolean)
    .slice(0, 10);
};

function splitOverallAndDetail(text) {
  const t = String(text || "").trim();
  if (!t) return { overallInsight: "", detailText: "" };
  const idx = t.indexOf("\n\n");
  if (idx === -1) {
    return { overallInsight: t, detailText: "" };
  }
  return {
    overallInsight: t.slice(0, idx).trim(),
    detailText: t.slice(idx + 2).trim(),
  };
}

function appendRuleInsightsAvoidingDup(geminiLines, ruleLines) {
  const out = [...geminiLines];
  for (const r of ruleLines) {
    const rt = String(r).trim();
    if (!rt) continue;
    const dup = out.some((g) => {
      const gt = String(g).trim();
      if (!gt) return false;
      return gt === rt || gt.includes(rt) || rt.includes(gt);
    });
    if (!dup) out.push(rt);
  }
  return out;
}

function buildNarrativeFromRules(overallInsight, ruleInsights) {
  const detail = (ruleInsights || [])
    .slice(0, 8)
    .map((l) => `- ${l}`)
    .join("\n");
  if (overallInsight && detail) return `${overallInsight}\n\n${detail}`;
  if (overallInsight) return overallInsight;
  return detail;
}

/**
 * @param {object} options
 * @param {(rows: any[], opts?: object) => object} options.computeAnalysis
 */
async function runGeminiRevenueAgent({
  apiKey,
  model,
  userPrompt,
  fetchRows,
  computeAnalysis,
  analysisOptions = {},
}) {
  let cachedRows = null;
  let lastForecast = [];
  let lastRuleInsights = [];
  let lastAnalysis = null;
  let lastOverallInsight = null;

  const toolDeclarations = [
    {
      name: "fetch_revenue_data",
      description:
        "Goi API nguon lay chuoi doanh thu luy ke (truong DateIs; CumValue hoac CumAmount). Phai goi buoc nay TRUOC khi tinh du bao.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {},
        required: [],
      },
    },
    {
      name: "compute_three_month_forecast",
      description:
        "Tinh du bao luy ke 3 thang tiep theo. Bang tra ve co ForecastedDate (chuan) va ForcastedDate (alias), ForecastedAmount. Chi goi sau khi da fetch du lieu thanh cong.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {},
        required: [],
      },
    },
  ];

  const genAI = new GoogleGenerativeAI(apiKey);
  const generativeModel = genAI.getGenerativeModel({
    model,
    tools: [{ functionDeclarations: toolDeclarations }],
    toolConfig: {
      functionCallingConfig: { mode: FunctionCallingMode.AUTO },
    },
    systemInstruction: `Ban la agent phan tich doanh thu.
Nhiem vu:
1) Hieu yeu cau nguoi dung (tieng Viet).
2) Dung tool fetch_revenue_data de lay du lieu thuc tu he thong.
3) Dung tool compute_three_month_forecast de tinh bang du bao 3 thang (so lieu do server tinh, khong tu bo sung con so).
4) Sau khi tool xong, tra loi bang tieng Viet theo DUNG thu tu sau:
   - Doan 1 (NHAN XET TONG QUAN): 2-5 cau lien, tom tat xu huong doanh thu luy ke, rui ro / co hoi, dinh huong ngan han. Khong xuong dong trong doan nay.
   - Mot dong trong (hai lan Enter).
   - Doan 2: 3-6 dong insight ngan, moi dong mot y (co the bat dau bang dau gach hoac so): chi tiet so voi du bao, sai so +-5% neu phu hop.
Khong bo qua buoc tool neu nguoi dung hoi ve du bao hay du lieu.`,
  });

  const chat = generativeModel.startChat();

  const executeTool = async (name) => {
    if (name === "fetch_revenue_data") {
      try {
        cachedRows = await fetchRows();
        const n = cachedRows.length;
        const first = n ? cachedRows[0] : null;
        const last = n ? cachedRows[n - 1] : null;
        return {
          ok: true,
          rowCount: n,
          sampleFirst: first,
          sampleLast: last,
        };
      } catch (err) {
        return { ok: false, error: err.message || String(err) };
      }
    }
    if (name === "compute_three_month_forecast") {
      if (!cachedRows || cachedRows.length < 4) {
        return {
          ok: false,
          error: "Chua co du lieu hop le. Hay goi fetch_revenue_data truoc.",
        };
      }
      try {
        const result = computeAnalysis(cachedRows, analysisOptions);
        lastForecast = result.forecast;
        lastRuleInsights = result.insights;
        lastAnalysis = result.analysis;
        lastOverallInsight = result.overallInsight ?? null;
        return {
          ok: true,
          forecast: result.forecast,
          technicalNotes: result.insights,
          analysisSummary: {
            period: result.analysis?.period,
            counts: result.analysis?.counts,
            cumulative: result.analysis?.cumulative,
            monthlyIncrements: result.analysis?.monthlyIncrements,
            forecastWithRange: result.analysis?.forecastWithRange,
          },
        };
      } catch (err) {
        return { ok: false, error: err.message || String(err) };
      }
    }
    return { ok: false, error: `Unknown tool: ${name}` };
  };

  let nextPayload =
    userPrompt.trim() ||
    "Hay lay du lieu doanh thu, tinh du bao 3 thang tiep theo va tom tat insight ngan.";

  let finalText = "";

  for (let turn = 0; turn < MAX_TOOL_TURNS; turn += 1) {
    const result = await chat.sendMessage(nextPayload);
    const calls = result.response.functionCalls();

    if (!calls || calls.length === 0) {
      try {
        finalText = result.response.text();
      } catch {
        finalText = "";
      }
      break;
    }

    const responseParts = [];
    for (const call of calls) {
      const toolResult = await executeTool(call.name);
      responseParts.push({
        functionResponse: {
          name: call.name,
          response: toolResult,
        },
      });
    }
    nextPayload = responseParts;
  }

  if (!String(finalText).trim() && lastForecast.length > 0) {
    finalText = buildNarrativeFromRules(lastOverallInsight, lastRuleInsights);
  }

  const { overallInsight, detailText } = splitOverallAndDetail(finalText);
  const geminiInsights = detailText
    ? textToInsightLines(detailText)
    : [];
  const insights =
    geminiInsights.length > 0
      ? appendRuleInsightsAvoidingDup(
          geminiInsights,
          lastRuleInsights.slice(0, 2)
        )
      : lastRuleInsights;

  return {
    forecast: lastForecast,
    insights,
    analysis: lastAnalysis,
    geminiText: finalText,
    overallInsight: overallInsight || undefined,
    usedGemini: true,
  };
}

module.exports = { runGeminiRevenueAgent, textToInsightLines };
