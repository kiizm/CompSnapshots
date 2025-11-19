import path from "path";
import fs from "fs/promises";
import { pool } from "./db";
import { analyzeCompetitor } from "./analysis";
import { renderReportHtml } from "./reportTemplate";
import puppeteer from "puppeteer";

export async function generateCompetitorReport(
  businessId: string,
  competitorId: string
) {
  // 1. Load business & competitor info
  const businessRes = await pool.query(
    `SELECT id, name, user_id FROM public.businesses WHERE id = $1`,
    [businessId]
  );
  if (businessRes.rowCount === 0) {
    throw new Error("Business not found");
  }
  const business = businessRes.rows[0];

  const competitorRes = await pool.query(
    `SELECT id, name FROM public.competitors WHERE id = $1`,
    [competitorId]
  );
  if (competitorRes.rowCount === 0) {
    throw new Error("Competitor not found");
  }
  const competitor = competitorRes.rows[0];

  // 2. Run analysis
  const analysis = await analyzeCompetitor(competitorId);

  const generatedAt = new Date().toISOString();
  const html = renderReportHtml({
    businessName: business.name,
    competitorName: competitor.name,
    generatedAt,
    analysis,
  });

  // 3. Launch headless browser and create PDF
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  await page.setContent(html, { waitUntil: "networkidle0" });

  const pdfBuffer = await page.pdf({
    format: "A4",
    printBackground: true,
    margin: {
      top: "20mm",
      bottom: "20mm",
      left: "15mm",
      right: "15mm",
    },
  });

  await browser.close();

  // 4. Save PDF to local filesystem (backend/reports)
  const reportsDir = path.join(__dirname, "..", "reports");
  await fs.mkdir(reportsDir, { recursive: true });

  const reportIdRes = await pool.query(
    `insert into public.reports (business_id, competitor_id, user_id, period_start, period_end, summary)
     values ($1, $2, $3, current_date, current_date, $4)
     returning id`,
    [businessId, competitorId, business.user_id, analysis]
  );
  
  const reportId = reportIdRes.rows[0].id as string;

  const fileName = `${reportId}.pdf`;
  const filePath = path.join(reportsDir, fileName);

  await fs.writeFile(filePath, pdfBuffer);

  // 5. pdf_url points to backend static route
  const pdfUrl = `/reports/${fileName}`;

  // Update row with pdf_url
  await pool.query(
    `update public.reports set pdf_url = $1 where id = $2`,
    [pdfUrl, reportId]
  );

  return {
    reportId,
    pdfUrl,
  };
}
