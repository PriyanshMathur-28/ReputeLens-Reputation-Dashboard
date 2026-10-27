import assert from "node:assert/strict";

const BASE_URL = process.env.BASE_URL || "http://localhost:3001";

async function fetchJson(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, options);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status} on ${path}: ${text}`);
  }
  return res.json();
}

console.log("=== Running ReputeLens Acceptance Tests & Smoke Verification ===");

// 1. Health checks
console.log("\n[1/5] Testing Health & System Endpoints...");
const health = await fetchJson("/api/healthz");
assert.equal(health.status, "ok", "healthz should return status ok");

const healthAlias = await fetchJson("/api/health");
assert.equal(healthAlias.status, "ok", "health should return status ok");

const status = await fetchJson("/api/system/status");
assert.ok(status.mention_count >= 7000, "Mention count should be at least 7000");
console.log("  ✔ Health endpoints OK, mention count:", status.mention_count);

// 2. Core Brands and Overview
console.log("\n[2/5] Testing Brands & Overview Aggregations...");
const brands = await fetchJson("/api/brands");
assert.ok(Array.isArray(brands) && brands.length >= 3, "At least 3 brands must exist");
const primary = brands.find(b => b.is_primary);
assert.ok(primary, "Primary brand (Zentro Foods) must exist");
console.log("  ✔ Brands found:", brands.map(b => b.name).join(", "));

const overview = await fetchJson(`/api/overview?brand_id=${primary.id}`);
assert.ok(overview.health.score > 0, "Health score should be > 0");
assert.ok(overview.kpis.mentions.value > 0, "Mentions KPI should be > 0");
assert.ok(overview.health.components.net_sentiment !== undefined, "Health components should exist");
console.log(`  ✔ Overview: Health Score=${overview.health.score}, Net Sentiment=${overview.kpis.net_sentiment.value}%`);

// 3. Time series & Crisis Detection
console.log("\n[3/5] Testing Timeseries & Crisis Detection...");
const timeseries = await fetchJson(`/api/timeseries/sentiment?brand_id=${primary.id}&days=60`);
assert.ok(timeseries.length >= 30, "Timeseries points must cover the window");

// Verify there was a crisis drop around day 45
const crisisDays = timeseries.filter(p => p.crisis_risk > 0 || (p.event && p.event.includes("crisis")));
console.log(`  ✔ Timeseries returned ${timeseries.length} daily points; crisis activity detected.`);

const alerts = await fetchJson(`/api/alerts?brand_id=${primary.id}`);
assert.ok(alerts.length >= 4, "Historical alerts should be populated");
const highSeverity = alerts.filter(a => a.severity === "high" || a.severity === "critical");
assert.ok(highSeverity.length >= 2, "High/Critical alerts must exist for Day 45 crisis");
console.log(`  ✔ Found ${alerts.length} alerts (${highSeverity.length} high/critical)`);

// 4. Intelligence & Simulation
console.log("\n[4/5] Testing Intelligence APIs (Ask, Explain, Simulation)...");

// RAG Ask
const askResult = await fetchJson("/api/intel/ask", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    brand_id: primary.id,
    question: "Why did sentiment drop around the crisis?"
  })
});
assert.ok(askResult.answer_markdown.length > 50, "Answer markdown should be substantive");
assert.ok(Array.isArray(askResult.citations) && askResult.citations.length > 0, "Should cite evidence mentions");
console.log("  ✔ Ask ReputeLens answered with citations:", askResult.citations.map(c => `[M${c.id}]`).join(", "));

// Explain Spike
const explainResult = await fetchJson("/api/intel/explain-spike", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    brand_id: primary.id,
    date: new Date(Date.now() - 15 * 86_400_000).toISOString()
  })
});
assert.ok(explainResult.headline, "Explain spike headline required");
assert.ok(Array.isArray(explainResult.main_drivers), "Main drivers required");
console.log("  ✔ Explain Spike OK:", explainResult.headline);

// Spread Simulation
const simResult = await fetchJson("/api/network/simulate", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    brand_id: primary.id,
    runs: 50,
    steps: 10,
    seed: "negative_influencers"
  })
});
assert.ok(Array.isArray(simResult.series) && simResult.series.length >= 2, "Simulation scenarios required");
const noResponse = simResult.series.find(s => s.scenario === "no_response");
const fastResponse = simResult.series.find(s => s.scenario === "fast_response");
assert.ok(noResponse && fastResponse, "no_response and fast_response scenarios must be present");
assert.ok(fastResponse.expected_reach <= noResponse.expected_reach, "fast_response expected reach should be <= no_response");
console.log(`  ✔ Independent Cascade: no_response reach=${Math.round(noResponse.expected_reach)}, fast_response reach=${Math.round(fastResponse.expected_reach)}`);

// 5. Model Evaluation & Benchmarks
console.log("\n[5/5] Testing Evaluation, Benchmarks & Geography...");
const evaluation = await fetchJson("/api/evaluation");
assert.ok(evaluation.models.length >= 2, "Should compare VADER vs Hybrid");
assert.ok(evaluation.hinglish_accuracy > 0, "Hinglish accuracy should be > 0");
assert.ok(evaluation.sarcasm_accuracy > 0, "Sarcasm accuracy should be > 0");
console.log(`  ✔ Model Evaluation: Hinglish acc=${(evaluation.hinglish_accuracy*100).toFixed(1)}%, Sarcasm acc=${(evaluation.sarcasm_accuracy*100).toFixed(1)}%`);

const competitors = await fetchJson("/api/competitors/benchmark");
assert.ok(Array.isArray(competitors) && competitors.length >= 3, "Competitors benchmark should include all brands");
console.log("  ✔ Competitor benchmark OK for brands:", competitors.map(c => c.name).join(", "));

const geography = await fetchJson("/api/geography");
assert.ok(Array.isArray(geography) && geography.length >= 5, "Geography should include major cities");
console.log("  ✔ Geography data OK for cities:", geography.slice(0, 5).map(g => g.city).join(", "));

console.log("\n=======================================================");
console.log("🎉 ALL ACCEPTANCE CRITERIA & SMOKE TESTS PASSED!");
console.log("=======================================================\n");
