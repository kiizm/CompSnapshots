import { pool } from "./db";
import Sentiment from "sentiment";

const sentiment = new Sentiment();

type ReviewRow = {
  rating: number | null;
  review_text: string | null;
};

export type CompetitorAnalysis = {
  competitor_id: string;
  total_reviews: number;
  avg_rating: number | null;
  rating_distribution: Record<string, number>;
  sentiment_breakdown: {
    positive: number;
    neutral: number;
    negative: number;
  };
  top_keywords: string[];
  top_positive_snippets: string[];
  top_negative_snippets: string[];
};

const STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "to",
  "of",
  "in",
  "on",
  "for",
  "with",
  "is",
  "it",
  "this",
  "that",
  "was",
  "were",
  "are",
  "at",
  "as",
  "but",
  "be",
  "have",
  "has",
  "had",
  "they",
  "them",
  "you",
  "your",
  "we",
  "our",
  "i",
  "he",
  "she",
  "their",
  "from",
  "so",
  "if",
  "not",
  "very",
  "just",
  "my",
  "me",
  "us",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

function cleanReviewText(raw: string): string {
  let text = raw;

  // Remove common UI noise words (Dutch + UI)
  text = text.replace(/\b(Meer|Like|Delen|reviews?|review|foto'?s?)\b/gi, "");

  // Remove "Local Guide · 7 reviews · 17 foto's" style bits
  text = text.replace(/Local Guide.*?/gi, "");
  text = text.replace(/\d+\s+reviews?/gi, "");
  text = text.replace(/\d+\s+foto'?s?/gi, "");

  // Remove strange icons / symbols
  text = text.replace(/[]/g, "");

  // Collapse extra spaces
  text = text.replace(/\s{2,}/g, " ").trim();

  return text;
}


export async function analyzeCompetitor(
  competitorId: string
): Promise<CompetitorAnalysis> {
  const { rows } = await pool.query<ReviewRow>(
    `
    SELECT rating, review_text
    FROM public.reviews
    WHERE competitor_id = $1
      AND review_text IS NOT NULL
    `,
    [competitorId]
  );

  const totalReviews = rows.length;

  if (totalReviews === 0) {
    return {
      competitor_id: competitorId,
      total_reviews: 0,
      avg_rating: null,
      rating_distribution: {},
      sentiment_breakdown: {
        positive: 0,
        neutral: 0,
        negative: 0,
      },
      top_keywords: [],
      top_positive_snippets: [],
      top_negative_snippets: [],
    };
  }

  // Rating stats
  let ratingSum = 0;
  const ratingDistribution: Record<string, number> = {
    "1": 0,
    "2": 0,
    "3": 0,
    "4": 0,
    "5": 0,
  };

  // Sentiment counters
  let posCount = 0;
  let neuCount = 0;
  let negCount = 0;

  // For snippets
  type ScoredReview = { text: string; score: number; rating: number | null };
  const positiveReviews: ScoredReview[] = [];
  const negativeReviews: ScoredReview[] = [];

  // Keywords
  const keywordFreq: Record<string, number> = {};

  for (const row of rows) {
    const rating = row.rating ?? 0;
    const rawText = row.review_text ?? "";
    const text = cleanReviewText(rawText);

    // Rating stats
    if (rating >= 1 && rating <= 5) {
      ratingSum += rating;
      ratingDistribution[String(rating)] =
        (ratingDistribution[String(rating)] || 0) + 1;
    }

    // Sentiment using text
    const sentimentResult = sentiment.analyze(text);
    const score = sentimentResult.score;

    if (score > 1) {
      posCount++;
      positiveReviews.push({ text, score, rating });
    } else if (score < -1) {
      negCount++;
      negativeReviews.push({ text, score, rating });
    } else {
      neuCount++;
    }

    // Keywords
    const tokens = tokenize(text);
    for (const token of tokens) {
      keywordFreq[token] = (keywordFreq[token] || 0) + 1;
    }
  }

  const avgRating =
    totalReviews > 0 && ratingSum > 0
      ? parseFloat((ratingSum / totalReviews).toFixed(2))
      : null;

  // Sentiment breakdown as percentages (0–100)
  const posPct = Math.round((posCount / totalReviews) * 100);
  const neuPct = Math.round((neuCount / totalReviews) * 100);
  const negPct = Math.round((negCount / totalReviews) * 100);

  // Top keywords
  const topKeywords = Object.entries(keywordFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([word]) => word);

  // Sort snippets: most positive / most negative
  positiveReviews.sort((a, b) => b.score - a.score);
  negativeReviews.sort((a, b) => a.score - b.score); // more negative first

  const top_positive_snippets = positiveReviews
    .slice(0, 5)
    .map((r) => r.text);

  const top_negative_snippets = negativeReviews
    .slice(0, 5)
    .map((r) => r.text);

  return {
    competitor_id: competitorId,
    total_reviews: totalReviews,
    avg_rating: avgRating,
    rating_distribution: ratingDistribution,
    sentiment_breakdown: {
      positive: posPct,
      neutral: neuPct,
      negative: negPct,
    },
    top_keywords: topKeywords,
    top_positive_snippets,
    top_negative_snippets,
  };
}
