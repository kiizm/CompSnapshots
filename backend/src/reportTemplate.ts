import type { CompetitorAnalysis } from "./analysis";

type ReportContext = {
  businessName: string;
  competitorName: string;
  generatedAt: string;
  analysis: CompetitorAnalysis;
};

export function renderReportHtml(ctx: ReportContext): string {
  const { businessName, competitorName, generatedAt, analysis } = ctx;

  const ratingDistRows = Object.entries(analysis.rating_distribution)
    .map(
      ([rating, count]) => `
      <tr>
        <td>${rating}★</td>
        <td>${count}</td>
      </tr>
    `
    )
    .join("");

  const keywords = analysis.top_keywords
    .slice(0, 20)
    .map((k) => `<span class="chip">${k}</span>`)
    .join("");

  const positiveSnippets = analysis.top_positive_snippets
    .map((t) => `<li>${escapeHtml(t)}</li>`)
    .join("");

  const negativeSnippets = analysis.top_negative_snippets
    .map((t) => `<li>${escapeHtml(t)}</li>`)
    .join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Competitor Report</title>
  <style>
    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      margin: 24px;
      color: #111827;
    }
    h1, h2, h3 {
      color: #111827;
      margin-bottom: 4px;
    }
    h1 {
      font-size: 24px;
      margin-bottom: 12px;
    }
    h2 {
      font-size: 18px;
      margin-top: 24px;
      margin-bottom: 8px;
    }
    p {
      margin: 4px 0;
    }
    .section {
      margin-top: 16px;
      padding-top: 8px;
      border-top: 1px solid #e5e7eb;
    }
    .summary-grid {
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
    }
    .card {
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 12px;
      min-width: 140px;
    }
    .metric-label {
      font-size: 12px;
      color: #6b7280;
    }
    .metric-value {
      font-size: 18px;
      font-weight: 600;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 8px;
    }
    th, td {
      border: 1px solid #e5e7eb;
      padding: 6px 8px;
      font-size: 12px;
    }
    th {
      background-color: #f9fafb;
      text-align: left;
    }
    .chips {
      margin-top: 8px;
    }
    .chip {
      display: inline-block;
      margin: 2px 4px 2px 0;
      padding: 4px 8px;
      border-radius: 9999px;
      background-color: #eff6ff;
      color: #1d4ed8;
      font-size: 11px;
    }
    ul {
      padding-left: 18px;
      font-size: 12px;
    }
    .small {
      font-size: 11px;
      color: #6b7280;
    }
  </style>
</head>
<body>
  <h1>Competitor Intelligence Report</h1>
  <p class="small">Generated: ${generatedAt}</p>

  <div class="section">
    <h2>Overview</h2>
    <p><strong>Your business:</strong> ${escapeHtml(businessName)}</p>
    <p><strong>Competitor:</strong> ${escapeHtml(competitorName)}</p>
  </div>

  <div class="section">
    <h2>Key Metrics</h2>
    <div class="summary-grid">
      <div class="card">
        <div class="metric-label">Total Reviews</div>
        <div class="metric-value">${analysis.total_reviews}</div>
      </div>
      <div class="card">
        <div class="metric-label">Average Rating</div>
        <div class="metric-value">${
          analysis.avg_rating !== null ? analysis.avg_rating.toFixed(2) : "N/A"
        }</div>
      </div>
      <div class="card">
        <div class="metric-label">Sentiment (Positive)</div>
        <div class="metric-value">${analysis.sentiment_breakdown.positive}%</div>
      </div>
      <div class="card">
        <div class="metric-label">Sentiment (Negative)</div>
        <div class="metric-value">${analysis.sentiment_breakdown.negative}%</div>
      </div>
    </div>
  </div>

  <div class="section">
    <h2>Rating Distribution</h2>
    <table>
      <thead>
        <tr>
          <th>Rating</th>
          <th>Count</th>
        </tr>
      </thead>
      <tbody>
        ${ratingDistRows}
      </tbody>
    </table>
  </div>

  <div class="section">
    <h2>Top Keywords</h2>
    <div class="chips">
      ${keywords || "<span class='small'>Not enough data yet.</span>"}
    </div>
  </div>

  <div class="section">
    <h2>What Customers Love</h2>
    ${
      positiveSnippets
        ? `<ul>${positiveSnippets}</ul>`
        : "<p class='small'>No clear positive themes detected yet.</p>"
    }
  </div>

  <div class="section">
    <h2>Common Complaints</h2>
    ${
      negativeSnippets
        ? `<ul>${negativeSnippets}</ul>`
        : "<p class='small'>No major negative themes detected yet.</p>"
    }
  </div>

  <div class="section">
    <h2>Action Hints (MVP, Rule-based)</h2>
    <p class="small">
      These are generic suggestions based on sentiment balance. AI-enhanced, competitor-specific recommendations will be added later.
    </p>
    <ul>
      ${
        analysis.sentiment_breakdown.negative > 20
          ? "<li>Consider addressing the most frequent negative themes directly (e.g. staff, waiting time, pricing).</li>"
          : "<li>Leverage your strengths: highlight in your own marketing what customers praise most about this competitor (and outperform them there).</li>"
      }
      <li>Monitor changes in sentiment over time to see if competitor campaigns are working.</li>
      <li>Use top keywords to inspire your own promo copy and menu/service descriptions.</li>
    </ul>
  </div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
