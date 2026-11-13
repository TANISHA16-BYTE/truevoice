// 40 Sample Sentences Benchmark Test for TrueVoice
// Validates accuracy, precision, and serious problem detection target from judges plan
const { runCheckPipeline } = require("../src/services/checkPipeline");
const { seedDatabase } = require("../src/db/seed");

const benchmarkDataset = [
  // --- Category A: Pricing Violations (Planted: Sunscreen 499 vs current 549, Serum 899 vs 799) ---
  { id: 1, text: "Get Daily Shield sunscreen for just ₹499 this weekend!", expectedViolation: true, expectedRule: "Pricing 2.1", severity: "HIGH" },
  { id: 2, text: "Daily Shield Sunscreen now available at an unbeatable ₹499 rate.", expectedViolation: true, expectedRule: "Pricing 2.1", severity: "HIGH" },
  { id: 3, text: "Buy Hydra Glow Serum at its launch rate of INR 899.", expectedViolation: true, expectedRule: "Pricing 2.1", severity: "HIGH" },
  { id: 4, text: "Our sunscreen is priced at 499 rs for a 50g tube.", expectedViolation: true, expectedRule: "Pricing 2.1", severity: "HIGH" },

  // --- Category B: Offer & Discount Violations (Planted: 30% off serum vs approved 20%; expired Diwali offer) ---
  { id: 5, text: "Celebrate winter with flat 30% off our serum!", expectedViolation: true, expectedRule: "Offers 2.2", severity: "HIGH" },
  { id: 6, text: "Special Winter Launch: Take 30% discount on Hydra Glow Serum today.", expectedViolation: true, expectedRule: "Offers 2.2", severity: "HIGH" },
  { id: 7, text: "Don't miss our 15% off Diwali offer with code DIWALI15!", expectedViolation: true, expectedRule: "Offers 2.2", severity: "HIGH" },
  { id: 8, text: "Grab the Diwali Glow Special before festival ends.", expectedViolation: true, expectedRule: "Offers 2.2", severity: "HIGH" },

  // --- Category C: Prohibited Clinical & Medical Claims ---
  { id: 9, text: "Hydra Glow Serum is clinically proven to restore skin in days.", expectedViolation: true, expectedRule: "Claims 3.1", severity: "HIGH" },
  { id: 10, text: "Our formula is clinically proven across all clinical metrics.", expectedViolation: true, expectedRule: "Claims 3.1", severity: "HIGH" },
  { id: 11, text: "Our serum removes wrinkles in 3 days guaranteed.", expectedViolation: true, expectedRule: "Claims 3.2", severity: "HIGH" },
  { id: 12, text: "Notice instant anti-wrinkle results in days with our patented blend.", expectedViolation: true, expectedRule: "Claims 3.2", severity: "HIGH" },
  { id: 13, text: "We use 100% natural ingredients with zero chemicals.", expectedViolation: true, expectedRule: "Claims 3.2", severity: "HIGH" },
  { id: 14, text: "Enjoy a 100% chemical-free serum for your face.", expectedViolation: true, expectedRule: "Claims 3.2", severity: "HIGH" },
  { id: 15, text: "Guaranteed results after just one application.", expectedViolation: true, expectedRule: "Claims 3.2", severity: "HIGH" },
  { id: 16, text: "Get instant results that last all day long.", expectedViolation: true, expectedRule: "Claims 3.2", severity: "HIGH" },
  { id: 17, text: "Voted the best sunscreen in India by thousands of users.", expectedViolation: true, expectedRule: "Claims 3.2", severity: "HIGH" },
  { id: 18, text: "India's No. 1 sunscreen for ultimate daily UV protection.", expectedViolation: true, expectedRule: "Claims 3.2", severity: "HIGH" },
  { id: 19, text: "Gentle Foam Cleanser cures acne and clears cystic breakouts permanently.", expectedViolation: true, expectedRule: "Claims 3.2", severity: "HIGH" },
  { id: 20, text: "Our miracle formula cures all signs of irritated skin.", expectedViolation: true, expectedRule: "Claims 3.2", severity: "HIGH" },

  // --- Category D: Unverified Claims (Needs Source) & Stale Certificate ---
  { id: 21, text: "Hydra Glow Serum is perfectly suitable for sensitive skin.", expectedViolation: true, expectedRule: "Claims 3.1", severity: "HIGH" },
  { id: 22, text: "Formulated to be suitable for sensitive skin without tingling.", expectedViolation: true, expectedRule: "Claims 3.1", severity: "HIGH" },
  { id: 23, text: "Glowvale is proud to be officially cruelty-free certified.", expectedViolation: true, expectedRule: "Claims 3.3", severity: "MEDIUM" },

  // --- Category E: Terminology & Pushy Tone 1.3 Violations ---
  { id: 24, text: "Try our Night Renew Cream for deeply nourished skin tonight.", expectedViolation: true, expectedRule: "Naming 4.1", severity: "MEDIUM" },
  { id: 25, text: "Switch to our cheapest skincare routine today.", expectedViolation: true, expectedRule: "Tone 1.1", severity: "HIGH" },
  { id: 26, text: "Achieve fairness and instant whitening with daily application.", expectedViolation: true, expectedRule: "Tone 1.2", severity: "HIGH" },
  { id: 27, text: "HURRY!!! BUY NOW BEFORE STOCK RUNS OUT!!!", expectedViolation: true, expectedRule: "Tone 1.3", severity: "MEDIUM" },
  { id: 28, text: "LIMITED TIME HURRY GRAB YOURS TODAY!!!!!!", expectedViolation: true, expectedRule: "Tone 1.3", severity: "MEDIUM" },

  // --- Category F: Trademark Collision & Regional Slang ---
  { id: 29, text: "Introducing Dewlite Serum, your daily brightening partner.", expectedViolation: true, expectedRule: "Naming 4.1", severity: "MEDIUM" },
  { id: 30, text: "Paayein gora nikhaar sirf teen dinon mein.", expectedViolation: true, expectedRule: "Tone 1.2", severity: "HIGH" },

  // --- Category G: Clean Compliant Sentences (Should PASS with 0 false violations) ---
  { id: 31, text: "Formulated with 2% hyaluronic acid to help skin look smoother.", expectedViolation: false },
  { id: 32, text: "Dermatologist-tested on 30 volunteers with zero irritation observed.", expectedViolation: false },
  { id: 33, text: "Daily Shield Sunscreen SPF 50 PA++++ offers broad-spectrum protection for ₹549.", expectedViolation: false },
  { id: 34, text: "Hydra Glow Serum is priced at ₹799 for a 30ml dropper bottle.", expectedViolation: false },
  { id: 35, text: "Winter sale starts with 20% off using code WINTER20.", expectedViolation: false },
  { id: 36, text: "Enjoy a dhamaka offer on our cleanser and serum bundle for ₹999.", expectedViolation: false }, // Allowed regional slang!
  { id: 37, text: "Chamakdar twacha paane ke liye use karein Gentle Foam Cleanser.", expectedViolation: false }, // Allowed Hindi phrase!
  { id: 38, text: "New customers can use WELCOME10 for 10% off their first order.", expectedViolation: false },
  { id: 39, text: "Discover your radiant daily routine with our fragrance-free formula.", expectedViolation: false },
  { id: 40, text: "Glowvale Gentle Foam Cleanser is available now for ₹399.", expectedViolation: false }
];

async function runBenchmark() {
  seedDatabase();
  console.log("\n=======================================================");
  console.log("   TRUEVOICE 40-SENTENCE BENCHMARK TEST SUITE");
  console.log("   Target Metrics (Judges Plan):");
  console.log("   - Precision >= 85% of flagged items are correct");
  console.log("   - Serious Detection >= 70% of serious issues caught");
  console.log("=======================================================\n");

  let truePositives = 0;
  let falsePositives = 0;
  let trueNegatives = 0;
  let falseNegatives = 0;
  let seriousTotal = 0;
  let seriousCaught = 0;

  for (const item of benchmarkDataset) {
    const res = await runCheckPipeline({ text: item.text });
    const hasFlags = res.findings.length > 0;
    const hasHighFlag = res.findings.some(f => f.severity === "HIGH");

    if (item.expectedViolation) {
      if (item.severity === "HIGH") seriousTotal++;

      if (hasFlags) {
        truePositives++;
        if (hasHighFlag && item.severity === "HIGH") seriousCaught++;
        console.log(`[PASS] Sentence #${item.id.toString().padStart(2, "0")}: Correctly flagged (${res.findings.length} findings, risk: ${res.risk_level}) -> Rule: ${res.findings[0]?.rule_ref}`);
      } else {
        falseNegatives++;
        console.log(`[FAIL] Sentence #${item.id.toString().padStart(2, "0")}: MISSED VIOLATION! Text: "${item.text}"`);
      }
    } else {
      if (!hasFlags) {
        trueNegatives++;
        console.log(`[PASS] Sentence #${item.id.toString().padStart(2, "0")}: Clean sentence passed without false alarms.`);
      } else {
        falsePositives++;
        console.log(`[FAIL] Sentence #${item.id.toString().padStart(2, "0")}: FALSE POSITIVE! Flagged clean sentence: "${item.text}" with ${res.findings[0]?.reason}`);
      }
    }
  }

  const precision = Math.round((truePositives / (truePositives + falsePositives)) * 100);
  const recall = Math.round((truePositives / (truePositives + falseNegatives)) * 100);
  const seriousDetection = Math.round((seriousCaught / (seriousTotal || 1)) * 100);

  console.log("\n-------------------------------------------------------");
  console.log("               BENCHMARK RESULTS SUMMARY               ");
  console.log("-------------------------------------------------------");
  console.log(`Total Sentences Tested:          ${benchmarkDataset.length}`);
  console.log(`Planted Violations:              30`);
  console.log(`Clean Sentences:                 10`);
  console.log(`True Positives (Caught):         ${truePositives} / 30`);
  console.log(`True Negatives (Clean Pass):     ${trueNegatives} / 10`);
  console.log(`False Positives (False Alarms):  ${falsePositives}`);
  console.log(`False Negatives (Missed):        ${falseNegatives}`);
  console.log("-------------------------------------------------------");
  console.log(`Precision Rate:                  ${precision}%  (Target: >= 85%) ${precision >= 85 ? "✅ TARGET EXCEEDED" : "❌ BELOW TARGET"}`);
  console.log(`Serious Problem Detection:       ${seriousDetection}%  (Target: >= 70%) ${seriousDetection >= 70 ? "✅ TARGET EXCEEDED" : "❌ BELOW TARGET"}`);
  console.log(`Overall Detection Recall:        ${recall}%`);
  console.log("-------------------------------------------------------\n");

  if (precision >= 85 && seriousDetection >= 70) {
    console.log("🎉 SUCCESS: TrueVoice meets and exceeds all Judges Plan criteria!");
    process.exit(0);
  } else {
    console.error("Benchmark failed to achieve target thresholds.");
    process.exit(1);
  }
}

if (require.main === module) {
  runBenchmark();
}

module.exports = { runBenchmark, benchmarkDataset };
