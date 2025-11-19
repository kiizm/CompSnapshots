import { chromium } from "playwright";
import { pool } from "../db";

type ScrapedReview = {
  rating: number | null;
  review_text: string | null;
  review_date: string | null;
  reviewer_name: string | null;
};

export async function scrapeGoogleMapsReviews(
  competitorId: string,
  googleMapsUrl: string,
  maxReviews = 20
) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    console.log("Opening Google Maps URL:", googleMapsUrl);
    await page.goto(googleMapsUrl, { waitUntil: "networkidle" });

    // Wait for reviews section to load (selector may need tweaking)
    await page.waitForTimeout(5000);

    // Scroll to load more reviews (simple approach)
    const scrollContainerSelector = 'div[aria-label*="Google reviews"], div[role="feed"]';
    const scrollContainer = await page.$(scrollContainerSelector);

    if (scrollContainer) {
      for (let i = 0; i < 5; i++) {
        await scrollContainer.evaluate((el) => {
          el.scrollBy(0, 1000);
        });
        await page.waitForTimeout(1000);
      }
    }

    // Select review elements (this selector is fragile; may need updates)
    const reviewItems = await page.$$(
      'div[aria-label="Google review"]'
    );

    console.log(`Found ${reviewItems.length} raw review elements`);

    const scraped: ScrapedReview[] = [];

    for (const item of reviewItems.slice(0, maxReviews)) {
      const ratingEl = await item.$('span[aria-label*="stars"]');
      const ratingText = ratingEl
        ? await ratingEl.getAttribute("aria-label")
        : null;
      let rating: number | null = null;
      if (ratingText) {
        const match = ratingText.match(/Rated (\d+(\.\d+)?) out of 5/);
        if (match && match[1]) {
          rating = parseFloat(match[1]);
        }
      }

      const nameEl = await item.$("a[href*='https://www.google.com/maps/contrib']");
      const reviewer_name = nameEl ? (await nameEl.innerText()).trim() : null;

      const reviewTextEl = await item.$("span[jsname='bN97Pc']");
      const review_text = reviewTextEl
        ? (await reviewTextEl.innerText()).trim()
        : null;

      const dateEl = await item.$("span[jsname='T3Jpef']");
      const review_date = dateEl ? (await dateEl.innerText()).trim() : null;

      scraped.push({
        rating,
        review_text,
        review_date,
        reviewer_name,
      });
    }

    console.log(`Scraped ${scraped.length} reviews, inserting into DB...`);

    for (const review of scraped) {
      await pool.query(
        `
        INSERT INTO public.reviews (competitor_id, rating, review_text, review_date, reviewer_name, source, raw_data)
        VALUES ($1, $2, $3, $4, $5, 'google_maps', $6)
        `,
        [
          competitorId,
          review.rating,
          review.review_text,
          review.review_date ? new Date(review.review_date) : null,
          review.reviewer_name,
          review, // store raw struct as jsonb
        ]
      );
    }

    return scraped.length;
  } catch (error) {
    console.error("Error scraping Google Maps:", error);
    throw error;
  } finally {
    await browser.close();
  }
}
