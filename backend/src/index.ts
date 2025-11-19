import express from "express";
import cors from "cors";
import { pool } from "./db";
import { scrapeGoogleMapsReviews } from "./scrapers/googleMaps";




const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/db-health", async (_req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json({
      status: "ok",
      time: result.rows[0].now,
    });
  } catch (error) {
    console.error("DB health check failed:", error);
    res.status(500).json({ status: "error", error: "DB connection failed" });
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
  