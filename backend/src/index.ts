import express from "express";
import cors from "cors";
import { pool } from "./db";

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
