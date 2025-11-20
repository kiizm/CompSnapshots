import express from "express";
import cors from "cors";
import { pool } from "./db";
import { scrapeGoogleMapsReviews } from "./scrapers/googleMaps";
import { analyzeCompetitor } from "./analysis";
import path from "path";
import { generateCompetitorReport } from "./reports";





const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

const reportsDir = path.join(__dirname, "..", "reports");
app.use("/reports", express.static(reportsDir));


app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/db-health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", db: "connected" });
  } catch (error: any) {
    console.error("DB health check error:", error);
    res.status(500).json({
      status: "error",
      error: error.message,
      code: error.code,
    });
  }
});


/**
 * TEMP: Test endpoint to create a business
 * For now, we don't have real auth, so user_id is null.
 * Later we'll plug in the real user_id from Supabase Auth.
 */
app.post("/test-business", async (req, res) => {
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({ error: "name is required" });
  }

  try {
    const result = await pool.query(
      `
      INSERT INTO public.businesses (name)
      VALUES ($1)
      RETURNING id, name, created_at;
      `,
      [name]
    );

    const business = result.rows[0];

    res.status(201).json({
      status: "ok",
      business,
    });
  } catch (error) {
    console.error("Error creating test business:", error);
    res.status(500).json({ error: "Failed to create business" });
  }
});


/**
 * TEMP: Create a competitor for a business (no auth yet)
 */
app.post("/test-competitor", async (req, res) => {
    const { business_id, name, google_maps_url, category } = req.body;
  
    if (!business_id || !name || !google_maps_url) {
      return res.status(400).json({
        error: "business_id, name and google_maps_url are required",
      });
    }
  
    try {
      const result = await pool.query(
        `
        INSERT INTO public.competitors (business_id, name, google_maps_url, category)
        VALUES ($1, $2, $3, $4)
        RETURNING id, business_id, name, google_maps_url, category, created_at;
        `,
        [business_id, name, google_maps_url, category || null]
      );
  
      res.status(201).json({
        status: "ok",
        competitor: result.rows[0],
      });
    } catch (error) {
      console.error("Error creating competitor:", error);
      res.status(500).json({ error: "Failed to create competitor" });
    }
  });

/**
 * TEMP: List all businesses
 */
app.get("/test-businesses", async (_req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT id, name, created_at
      FROM public.businesses
      ORDER BY created_at DESC
      LIMIT 50;
      `
    );

    res.json({
      status: "ok",
      businesses: result.rows,
    });
  } catch (error) {
    console.error("Error fetching businesses:", error);
    res.status(500).json({ error: "Failed to fetch businesses" });
  }
});

app.listen(PORT, () => {
  console.log(`Backend API listening on http://localhost:${PORT}`);
});

/**
 * Trigger scraping for a competitor by id
 */
app.post("/scrape-competitor/:id", async (req, res) => {
    const { id } = req.params;
  
    try {
      const result = await pool.query(
        `
        SELECT id, google_maps_url
        FROM public.competitors
        WHERE id = $1
        `,
        [id]
      );
  
      if (result.rowCount === 0) {
        return res.status(404).json({ error: "Competitor not found" });
      }
  
      const competitor = result.rows[0];
  
      if (!competitor.google_maps_url) {
        return res.status(400).json({ error: "Competitor has no google_maps_url" });
      }
  
      const insertedCount = await scrapeGoogleMapsReviews(
        competitor.id,
        competitor.google_maps_url,
        20
      );
  
      res.json({
        status: "ok",
        competitor_id: competitor.id,
        reviews_inserted: insertedCount,
      });
    } catch (error) {
      console.error("Error in /scrape-competitor:", error);
      res.status(500).json({ error: "Failed to scrape competitor" });
    }
  });

/**
 * Get reviews for a competitor
 */
app.get("/competitor/:id/reviews", async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `
      SELECT 
        id,
        competitor_id,
        rating,
        review_text,
        review_date,
        reviewer_name,
        source,
        created_at
      FROM public.reviews
      WHERE competitor_id = $1
      ORDER BY created_at DESC
      LIMIT 100
      `,
      [id]
    );

    res.json({
      status: "ok",
      competitor_id: id,
      reviews: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    console.error("Error fetching reviews:", error);
    res.status(500).json({ error: "Failed to fetch reviews" });
  }
});

/**
 * Get all reviews (for testing/debugging)
 */
app.get("/reviews", async (_req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT 
        r.id,
        r.competitor_id,
        c.name as competitor_name,
        r.rating,
        r.review_text,
        r.review_date,
        r.reviewer_name,
        r.source,
        r.created_at
      FROM public.reviews r
      LEFT JOIN public.competitors c ON r.competitor_id = c.id
      ORDER BY r.created_at DESC
      LIMIT 100
      `
    );

    res.json({
      status: "ok",
      reviews: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    console.error("Error fetching all reviews:", error);
    res.status(500).json({ error: "Failed to fetch reviews" });
  }
});

/**
 * Get analysis for a competitor
 */
app.get("/competitors/:id/analysis", async (req, res) => {
    const { id } = req.params;
  
    try {
      // Optionally verify the competitor exists
      const existing = await pool.query(
        `SELECT id FROM public.competitors WHERE id = $1`,
        [id]
      );
  
      if (existing.rowCount === 0) {
        return res.status(404).json({ error: "Competitor not found" });
      }
  
      const analysis = await analyzeCompetitor(id);
  
      res.json({
        status: "ok",
        analysis,
      });
    } catch (error) {
      console.error("Error in /competitors/:id/analysis:", error);
      res
        .status(500)
        .json({ status: "error", error: "Failed to analyze competitor" });
    }
  });
  
  /**
 * Generate a report for a business + competitor
 * For now, no auth; later we will check user ownership.
 */
app.post(
  "/businesses/:businessId/competitors/:competitorId/report",
  async (req, res) => {
    const { businessId, competitorId } = req.params;

    try {
      const { reportId, pdfUrl } = await generateCompetitorReport(
        businessId,
        competitorId
      );

      res.status(201).json({
        status: "ok",
        report_id: reportId,
        pdf_url: pdfUrl,
      });
    } catch (error: any) {
      console.error("Error generating report:", error);
      res.status(500).json({
        status: "error",
        error: error?.message || "Failed to generate report",
      });
    }
  }
);
