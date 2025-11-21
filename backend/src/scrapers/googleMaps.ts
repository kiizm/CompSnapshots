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
  maxReviews = 5 // <-- limit to 5 by default
) {
  // Run in non-headless mode for debugging
  // Run in headless mode for production
  const browser = await chromium.launch({ 
    headless: true
  });
  const page = await browser.newPage();

  try {
    console.log("Opening Google Maps URL:", googleMapsUrl);
    await page.goto(googleMapsUrl, { waitUntil: "networkidle" });

    // Wait for page to load
    await page.waitForTimeout(3000);
    
    // Handle cookie consent dialog
    try {
      console.log("Checking for cookie consent dialog...");
      
      // Wait a bit for cookie dialog to appear
      await page.waitForTimeout(2000);
      
      let cookieAccepted = false;
      
      // Method 1: Try using Playwright's :has-text() selector (most reliable)
      try {
        const textSelectors = [
          'button:has-text("Accept all")',
          'button:has-text("I agree")',
          'button:has-text("Accept")',
          'button:has-text("Agree")',
          'button:has-text("OK")',
          'button:has-text("Got it")',
        ];
        
        for (const selector of textSelectors) {
          try {
            const button = page.locator(selector).first();
            const count = await button.count();
            if (count > 0) {
              const isVisible = await button.isVisible();
              if (isVisible) {
                const text = await button.innerText();
                console.log(`Found cookie consent button with text: ${text}`);
                await button.click();
                await page.waitForTimeout(2000);
                cookieAccepted = true;
                console.log("Cookie consent accepted!");
                break;
              }
            }
          } catch (e) {
            continue;
          }
        }
      } catch (e) {
        console.log("Method 1 failed, trying alternatives...");
      }
      
      // Method 2: Try common selectors
      if (!cookieAccepted) {
        const cookieSelectors = [
          'button[id*="accept"]',
          'button[aria-label*="Accept"]',
          'button[aria-label*="accept"]',
          'button[data-value="accept"]',
          '[data-value="accept"]',
          'button[jsname="b3VHJd"]', // Common Google cookie button jsname
          'button[jsname*="accept"]',
        ];
        
        for (const selector of cookieSelectors) {
          try {
            const cookieButton = await page.$(selector);
            if (cookieButton) {
              const isVisible = await cookieButton.isVisible();
              if (isVisible) {
                console.log(`Found cookie consent button with selector: ${selector}`);
                await cookieButton.click();
                await page.waitForTimeout(2000);
                cookieAccepted = true;
                console.log("Cookie consent accepted!");
                break;
              }
            }
          } catch (e) {
            continue;
          }
        }
      }
      
      // Method 3: Find buttons in dialogs by text content
      if (!cookieAccepted) {
        try {
          const dialogButtons = await page.$$('div[role="dialog"] button, div[class*="dialog"] button, div[class*="cookie"] button');
          for (const button of dialogButtons) {
            try {
              const text = await button.innerText();
              if (text && (text.toLowerCase().includes('accept') || text.toLowerCase().includes('agree') || text.toLowerCase().includes('ok'))) {
                const isVisible = await button.isVisible();
                if (isVisible) {
                  console.log(`Found cookie consent button with text: ${text}`);
                  await button.click();
                  await page.waitForTimeout(2000);
                  cookieAccepted = true;
                  console.log("Cookie consent accepted!");
                  break;
                }
              }
            } catch (e) {
              continue;
            }
          }
        } catch (e) {
          // Continue
        }
      }
      
      if (!cookieAccepted) {
        console.log("No cookie consent dialog found or could not click it - continuing anyway");
      }
    } catch (e) {
      console.log("Error handling cookie consent:", e);
    }
    
    // Take a screenshot for debugging
    try {
      await page.screenshot({ path: 'debug-initial.png', fullPage: false });
      console.log("Screenshot saved: debug-initial.png");
    } catch (e) {
      console.log("Could not take screenshot:", e);
    }

    // Try to click on "Reviews" button/tab if it exists
    try {
      const reviewsButton = await page.$('button:has-text("Reviews"), button[data-value="Reviews"], button[aria-label*="Reviews"]');
      if (reviewsButton) {
        console.log("Clicking on Reviews button...");
        await reviewsButton.click();
        await page.waitForTimeout(2000);
      }
    } catch (e) {
      console.log("Could not find/click Reviews button, continuing...");
    }

    // Try multiple selectors for review elements (Google Maps structure varies)
    let reviewItems = await page.$$('div[aria-label="Google review"]');
    
    if (reviewItems.length === 0) {
      // Try alternative selectors
      reviewItems = await page.$$('div[data-review-id]');
    }
    
    if (reviewItems.length === 0) {
      // Try finding review container and scrolling
      const scrollContainerSelector = 'div[aria-label*="Google reviews"], div[role="feed"], div[jsaction*="scroll"]';
      const scrollContainer = await page.$(scrollContainerSelector);

      if (scrollContainer) {
        console.log("Scrolling to load reviews...");
        for (let i = 0; i < 10; i++) {
          await scrollContainer.evaluate((el) => {
            el.scrollBy(0, 1000);
          });
          await page.waitForTimeout(1500);
          
          // Check if reviews appeared
          reviewItems = await page.$$('div[aria-label="Google review"], div[data-review-id]');
          if (reviewItems.length > 0) break;
        }
      }
    }

    console.log(`Found ${reviewItems.length} raw review elements`);
    
    // Take another screenshot after scrolling
    if (reviewItems.length === 0) {
      try {
        await page.screenshot({ path: 'debug-no-reviews.png', fullPage: true });
        console.log("Screenshot saved: debug-no-reviews.png (no reviews found)");
      } catch (e) {
        console.log("Could not take screenshot:", e);
      }
    }

    const scraped: ScrapedReview[] = [];

    for (let i = 0; i < reviewItems.length && i < maxReviews; i++) {
      try {
        const item = reviewItems[i];
        if (!item) {
          console.log(`Review ${i + 1}: item is null, skipping...`);
          continue;
        }
        
        // Get all text content from the review item - this is the most reliable method
        let allText = "";
        try {
          allText = await item.innerText();
          console.log(`\n--- Review ${i + 1} ---`);
          console.log(`All text: ${allText.substring(0, Math.min(300, allText.length))}...`);
        } catch (e) {
          console.log(`Error getting text for review ${i + 1}:`, e);
          continue; // Skip this review if we can't get text
        }
        
        if (!allText || allText.trim().length === 0) {
          console.log(`Review ${i + 1} has no text, skipping...`);
          continue;
        }
        
        // Parse the text intelligently - Google Maps reviews typically have this structure:
        // Line 1: Reviewer name
        // Line 2: Rating (X stars or X out of 5)
        // Line 3+: Review text
        // Last line: Date (X months ago, etc.)
        const lines = allText.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0);
        
        if (lines.length === 0) {
          console.log(`Review ${i + 1}: no lines after parsing, skipping...`);
          continue;
        }
        
        // Extract rating - try from aria-label first, then from text
        let rating: number | null = null;
      
        // Method 1: Try aria-label from rating element
        try {
          const ratingEl = await item.$('span[aria-label*="star"], [role="img"][aria-label*="star"], img[aria-label*="star"]');
          if (ratingEl) {
            const ratingText = await ratingEl.getAttribute("aria-label");
            if (ratingText) {
              const match = ratingText.match(/Rated (\d+(?:\.\d+)?) out of 5|(\d+(?:\.\d+)?)\s*star/i);
              if (match) {
                rating = parseFloat(match[1] || match[2] || "0");
              }
            }
          }
        } catch (e) {
          // Continue to text-based extraction
        }
        
        // Method 2: Extract from text content
        if (!rating) {
          const ratingMatch = allText.match(/(\d+(?:\.\d+)?)\s*(?:out of|\/)\s*5|(\d+(?:\.\d+)?)\s*star/i);
          if (ratingMatch) {
            const ratingValue = parseFloat(ratingMatch[1] || ratingMatch[2] || "0");
            if (ratingValue > 0 && ratingValue <= 5) {
              rating = ratingValue;
            }
          }
        }

        // Extract reviewer name - try from link first, then from text
        let reviewer_name: string | null = null;
        
        // Method 1: Try to find name in contributor link
        try {
          const nameEl = await item.$("a[href*='contrib'], button[aria-label*='Profile']");
          if (nameEl) {
            reviewer_name = (await nameEl.innerText()).trim();
          }
        } catch (e) {
          // Continue to text-based extraction
        }
        
        // Method 2: Extract from first line of text (usually the name)
        if (!reviewer_name && lines.length > 0 && lines[0]) {
          // First line is usually the reviewer name
          reviewer_name = lines[0];
          // Clean up - remove common suffixes
          reviewer_name = reviewer_name.replace(/\s*\d+\s*(?:month|year|week|day)s?\s*ago.*$/i, '').trim();
        }

        // Extract review text - use text-based parsing (most reliable)
        let review_text: string | null = null;
        
        // Method 1: Try to find review text element
        try {
          const reviewTextEl = await item.$("span[jsname='bN97Pc'], span[class*='review-text'], div[class*='review-text']");
          if (reviewTextEl) {
            review_text = (await reviewTextEl.innerText()).trim();
          }
        } catch (e) {
          // Continue to text-based extraction
        }
        
        // Method 2: Extract from text lines (skip name, rating, date)
        if (!review_text && lines.length > 1) {
          // Skip first line (name), skip lines with rating/date, get the rest
          const textLines = lines.slice(1).filter((line: string) => {
            if (!line) return false;
            // Skip rating lines
            if (line.match(/\d+\s*(?:out of|\/)\s*5|\d+\s*star/i)) return false;
            // Skip date lines
            if (line.match(/\d+\s*(?:month|year|week|day|hour|minute)s?\s*ago/i)) return false;
            // Skip lines that are just the reviewer name repeated
            if (reviewer_name && line.trim() === reviewer_name.trim()) return false;
            // Accept longer lines as review text (even if short, might be valid)
            return true;
          });
          
          if (textLines.length > 0) {
            review_text = textLines.join(' ').trim() || null;
            // If the text is very short, it might still be valid, so keep it
          }
        }
        
        // Method 3: If still no text, try to get any long text block from the element
        if (!review_text) {
          try {
            // Get all text and remove name, rating, date patterns
            let cleanedText = allText;
            if (reviewer_name) {
              cleanedText = cleanedText.replace(new RegExp(reviewer_name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '');
            }
            cleanedText = cleanedText.replace(/\d+\s*(?:out of|\/)\s*5|\d+\s*star/gi, '');
            cleanedText = cleanedText.replace(/\d+\s*(?:month|year|week|day|hour|minute)s?\s*ago/gi, '');
            cleanedText = cleanedText.replace(/\n+/g, ' ').trim();
            
            // If we have substantial text left, use it
            if (cleanedText.length > 20) {
              review_text = cleanedText;
            }
          } catch (e) {
            // Ignore
          }
        }

        // Extract date - try from element first, then from text
        let review_date: string | null = null;
        
        // Method 1: Try to find date element
        try {
          const dateEl = await item.$("span[jsname='T3Jpef'], span[class*='date'], span[aria-label*='ago']");
          if (dateEl) {
            review_date = (await dateEl.innerText()).trim();
          }
        } catch (e) {
          // Continue to text-based extraction
        }
        
        // Method 2: Extract from text (usually last line or contains "ago")
        if (!review_date) {
          // Look for date pattern in lines (usually at the end)
          for (let j = lines.length - 1; j >= 0; j--) {
            const line = lines[j];
            if (!line) continue;
            const dateMatch = line.match(/(\d+\s*(?:month|year|week|day|hour|minute)s?\s*ago)/i);
            if (dateMatch && dateMatch[1]) {
              review_date = dateMatch[1];
              break;
            }
          }
        }
        
        console.log(`Extracted - Rating: ${rating}, Name: ${reviewer_name?.substring(0, 30) || 'N/A'}, Date: ${review_date || 'N/A'}, Text: ${review_text?.substring(0, 50) || 'N/A'}...`);

        // Add review if we have any data at all (be less strict)
        // Even if we only have a name or date, it's still a review
        if (rating || review_text || reviewer_name || review_date) {
          scraped.push({
            rating,
            review_text: review_text || null,
            review_date: review_date || null,
            reviewer_name: reviewer_name || null,
          });
          console.log(`✓ Added review ${i + 1} to scraped list`);
        } else {
          console.log(`✗ Skipping review ${i + 1} - no data found at all`);
          // Debug: log the raw text to see what we're missing
          console.log(`  Raw text preview: ${allText.substring(0, 100)}...`);
        }
      } catch (reviewError) {
        console.error(`Error processing review ${i + 1}:`, reviewError);
        // Continue with next review
        continue;
      }
    }

    console.log(`Scraped ${scraped.length} reviews, inserting into DB...`);

    let insertedCount = 0;
    for (let idx = 0; idx < scraped.length; idx++) {
      const review = scraped[idx];
      if (!review) continue; // Skip if review is undefined
      
      try {
        // Don't try to parse date as Date object - store as string
        // Dates like "3 months ago" can't be parsed as Date objects
        await pool.query(
          `
          INSERT INTO public.reviews (competitor_id, rating, review_text, review_date, reviewer_name, source, raw_data)
          VALUES ($1, $2, $3, $4, $5, 'google_maps', $6)
          `,
          [
            competitorId,
            review.rating,
            review.review_text,
            review.review_date, // Store as string, not Date object
            review.reviewer_name,
            JSON.stringify(review), // store raw struct as jsonb
          ]
        );
        insertedCount++;
        console.log(`✓ Inserted review ${idx + 1}/${scraped.length}`);
      } catch (dbError) {
        console.error(`✗ Error inserting review ${idx + 1}:`, dbError);
        // Continue with next review instead of failing completely
        continue;
      }
    }
    
    console.log(`Successfully inserted ${insertedCount} out of ${scraped.length} reviews`);

    console.log(`Successfully scraped ${scraped.length} reviews`);
    
    return insertedCount; // Return the number actually inserted, not scraped
  } catch (error) {
    console.error("Error scraping Google Maps:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
      console.error("Error stack:", error.stack);
    }
    throw error;
  } finally {
    try {
      await browser.close();
    } catch (e) {
      // Ignore close errors
    }
  }
}





