// File Upload & Multi-Format Draft Extraction Controller
// Supports: .txt, .md, .csv, .json, .html, .xml, .rtf, .docx, .pptx (zero-dependency pure Node)
// Plus multimodal Gemini extraction & visual/logo compliance checks for: .pdf, .png, .jpg, .jpeg, .webp, .gif
const zlib = require("node:zlib");
const https = require("node:https");
const path = require("node:path");
const crypto = require("node:crypto");
const { runCheckPipeline } = require("../services/checkPipeline");

const TEXT_EXTENSIONS = new Set([
  ".txt", ".md", ".markdown", ".csv", ".tsv", ".json", ".html", ".htm", ".xml", ".log", ".yml", ".yaml"
]);

const MIME_BY_EXT = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif"
};

const MAX_UPLOAD_BYTES = 6 * 1024 * 1024; // 6 MB decoded binary limit

function sanitizeText(raw) {
  return String(raw || "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
    .replace(/\r\n/g, "\n")
    .trim();
}

function decodeXmlEntities(str) {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function readZipEntries(buffer, pathPredicate) {
  let eocdOffset = -1;
  const minOffset = Math.max(0, buffer.length - 65558);
  for (let i = buffer.length - 22; i >= minOffset; i--) {
    if (
      buffer[i] === 0x50 &&
      buffer[i + 1] === 0x4b &&
      buffer[i + 2] === 0x05 &&
      buffer[i + 3] === 0x06
    ) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) {
    throw new Error("Invalid Office ZIP archive.");
  }

  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const cdOffset = buffer.readUInt32LE(eocdOffset + 16);
  const matched = [];
  let cursor = cdOffset;

  for (let i = 0; i < entryCount && cursor + 46 <= buffer.length; i++) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) break;
    const compressionMethod = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const nameLen = buffer.readUInt16LE(cursor + 28);
    const extraLen = buffer.readUInt16LE(cursor + 30);
    const commentLen = buffer.readUInt16LE(cursor + 32);
    const localHeaderOffset = buffer.readUInt32LE(cursor + 42);
    const entryName = buffer.slice(cursor + 46, cursor + 46 + nameLen).toString("utf8");
    cursor += 46 + nameLen + extraLen + commentLen;

    if (!pathPredicate(entryName)) continue;
    if (buffer.readUInt32LE(localHeaderOffset) !== 0x04034b50) continue;
    const lNameLen = buffer.readUInt16LE(localHeaderOffset + 26);
    const lExtraLen = buffer.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + lNameLen + lExtraLen;
    const compressedSlice = buffer.slice(dataStart, dataStart + compressedSize);

    let fileData;
    if (compressionMethod === 0) {
      fileData = compressedSlice;
    } else if (compressionMethod === 8) {
      fileData = zlib.inflateRawSync(compressedSlice);
    } else {
      continue;
    }
    matched.push({ name: entryName, data: fileData.toString("utf8") });
  }
  return matched;
}

function extractTextFromDocx(buffer) {
  const entries = readZipEntries(
    buffer,
    (name) =>
      name === "word/document.xml" ||
      /^word\/(header|footer)\d*\.xml$/i.test(name)
  );
  if (entries.length === 0) {
    throw new Error("Could not find word/document.xml inside .docx file.");
  }
  entries.sort((a, b) =>
    a.name === "word/document.xml"
      ? -1
      : b.name === "word/document.xml"
      ? 1
      : a.name.localeCompare(b.name)
  );
  const parts = entries.map((e) => {
    const withBreaks = e.data
      .replace(/<\/w:p>/g, "\n")
      .replace(/<w:br\b[^>]*\/>/g, "\n")
      .replace(/<w:tab\b[^>]*\/>/g, " ")
      .replace(/<[^>]+>/g, "");
    return decodeXmlEntities(withBreaks);
  });
  return parts.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function extractTextFromPptx(buffer) {
  const entries = readZipEntries(
    buffer,
    (name) =>
      /^ppt\/slides\/slide\d+\.xml$/i.test(name) ||
      /^ppt\/notesSlides\/notesSlide\d+\.xml$/i.test(name)
  );
  if (entries.length === 0) {
    throw new Error("Could not find any slides inside .pptx file.");
  }
  const slideNum = (name) => {
    const m = name.match(/(\d+)\.xml$/i);
    return m ? parseInt(m[1], 10) : 0;
  };
  entries.sort((a, b) => {
    const aIsNote = a.name.includes("notesSlide");
    const bIsNote = b.name.includes("notesSlide");
    if (aIsNote !== bIsNote) return aIsNote ? 1 : -1;
    return slideNum(a.name) - slideNum(b.name);
  });
  const parts = entries
    .map((e) => {
      const withBreaks = e.data
        .replace(/<\/a:p>/g, "\n")
        .replace(/<a:br\b[^>]*\/>/g, "\n")
        .replace(/<[^>]+>/g, "");
      return decodeXmlEntities(withBreaks).trim();
    })
    .filter(Boolean);
  return parts.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}

function extractTextFromRtf(raw) {
  return raw
    .replace(/\\par[d]?/g, "\n")
    .replace(/\\line/g, "\n")
    .replace(/\\tab/g, " ")
    .replace(/\\'[0-9a-fA-F]{2}/g, "")
    .replace(/\\[a-zA-Z]+-?\d* ?/g, "")
    .replace(/[{}]/g, "")
    .trim();
}

function callGeminiMultimodalOnce(apiKey, model, base64Data, mimeType, prompt, responseMimeType = null, timeoutMs = 20000) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const generationConfig = {
    temperature: 0,
    maxOutputTokens: 2048
  };
  if (model.startsWith("gemini-2.5")) {
    generationConfig.thinkingConfig = { thinkingBudget: 0 };
  }
  if (responseMimeType) {
    generationConfig.responseMimeType = responseMimeType;
  }

  const payload = JSON.stringify({
    contents: [
      {
        role: "user",
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType,
              data: base64Data
            }
          }
        ]
      }
    ],
    generationConfig
  });

  return new Promise((resolve, reject) => {
    const url = new URL(endpoint);
    const req = https.request(
      {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload)
        }
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(raw);
            if (res.statusCode >= 400) {
              const msg = parsed?.error?.message || `Gemini extraction failed (${res.statusCode}).`;
              const err = new Error(msg);
              err.statusCode = res.statusCode;
              return reject(err);
            }
            const text =
              parsed?.candidates?.[0]?.content?.parts
                ?.map((p) => p.text || "")
                .join("\n")
                .trim() || "";
            resolve(text);
          } catch (err) {
            reject(new Error("Invalid response from Gemini extraction service."));
          }
        });
      }
    );
    req.on("error", reject);
    req.setTimeout(timeoutMs, () => {
      const err = new Error("Timed out extracting text from file.");
      err.statusCode = 504;
      req.destroy(err);
    });
    req.write(payload);
    req.end();
  });
}

async function callGeminiMultimodal(base64Data, mimeType, prompt, responseMimeType = null) {
  const apiKey = process.env.GEMINI_API_KEY || "";
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not configured on the backend server. PDF and image inspection requires GEMINI_API_KEY in .env."
    );
  }

  const primary = (process.env.GEMINI_MODEL || "gemini-3.5-flash-lite").trim().replace(/\s+/g, "-");
  const secondary = primary === "gemini-3.8-flash" ? "gemini-3.5-flash-lite" : "gemini-3.8-flash";
  const models = [primary, secondary, primary, secondary];
  let lastErr = null;
  const deadline = Date.now() + 25000;

  for (let i = 0; i < models.length; i++) {
    const remaining = deadline - Date.now();
    if (remaining < 3000) break;
    try {
      return await callGeminiMultimodalOnce(apiKey, models[i], base64Data, mimeType, prompt, responseMimeType, Math.min(14000, remaining));
    } catch (err) {
      lastErr = err;
      const status = err && err.statusCode ? err.statusCode : 0;
      console.warn("[uploadController] Gemini model failed:", models[i], status || "ERR", err.message);
      const transient = status === 429 || status === 500 || status === 502 || status === 503;
      if (status === 504) {
        break;
      }
      if (!transient && status !== 404) {
        throw err;
      }
      if (i < models.length - 1) {
        await new Promise((r) => setTimeout(r, i >= 1 ? 1200 : 500));
      }
    }
  }

  const status = lastErr && lastErr.statusCode ? lastErr.statusCode : 0;
  if (status === 429 || status === 503) {
    throw new Error(
      "Visual/PDF AI service is experiencing a temporary traffic spike. Wait a few seconds and try uploading again, or paste the ad copy directly."
    );
  }
  if (status === 504) {
    throw new Error(
      "Timed out reading this file. Try a smaller PDF (1–3 pages) or compressed image, or paste the ad copy directly."
    );
  }
  throw lastErr || new Error("Gemini extraction failed.");
}

function extractTextWithGemini(base64Data, mimeType, filename) {
  const prompt =
    `Extract ALL readable marketing, ad, product, pricing, discount, claim, and caption text from this file (${filename}) verbatim. ` +
    "Return ONLY the extracted plain text with no commentary, markdown fences, or extra labels.";
  return callGeminiMultimodal(base64Data, mimeType, prompt);
}

function normalizeSeverity(raw) {
  const s = String(raw || "").toUpperCase();
  if (s === "HIGH" || s === "MEDIUM" || s === "LOW") return s;
  return "MEDIUM";
}

function parseVisualJson(raw) {
  const cleaned = String(raw || "")
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  return JSON.parse(cleaned);
}

async function analyzeImageWithGemini(base64Data, mimeType, filename) {
  const prompt =
    `You are TrueVoice Visual Compliance Inspector for Glowvale Skincare (${filename}).\n` +
    "Inspect this uploaded image/ad creative and return a single JSON object with keys:\n" +
    '- "extracted_text": verbatim OCR string of all headlines, body text, prices, offer codes, visual seals/badges, and fine-print disclaimers.\n' +
    '- "visual_summary": 1-sentence description of what the creative displays (brand/logo visibility, product visuals, badges, disclaimer readability).\n' +
    '- "visual_findings": array (0 to 5 items) of ONLY clear visual, logo, seal, or legibility compliance issues grounded in Glowvale Brand Guidelines (Source S-01):\n' +
    '  1) Brand/Logo check (rule_ref: "Naming 4.1", source_id: "S-01"): retired product names ("Night Renew Cream"), lookalike competitor trademarks ("Dewlite", "GlowBoost", "YouthShield", "DermaPure" — include "This is an AI suggestion, not legal advice. Please consult your legal team."), or distorted/illegible Glowvale logo.\n' +
    '  2) Visual seals/badges (rule_ref: "Claims 3.2", source_id: "S-01"; or "Claims 3.3", source_id: "S-06"): graphic badges/stamps claiming "100% Natural", "Chemical-Free", "Clinically Proven", "Miracle", or "Cruelty-Free Certified" (Source S-06 expired Oct 2026).\n' +
    '  3) Fine-print/disclaimer legibility (rule_ref: "Offers 2.2" or "Claims 3.1", source_id: "S-01"): missing, cropped, or unreadable/low-contrast offer validity dates or claim disclaimers.\n' +
    'Each item in visual_findings must have: severity ("HIGH"|"MEDIUM"|"LOW"), flagged_text, rule_ref, source_id, reason, suggested_fix, confidence (0.5 to 0.99).\n' +
    "If there are no visual/logo issues, return an empty array for visual_findings. Return ONLY valid JSON.";

  const raw = await callGeminiMultimodal(base64Data, mimeType, prompt, "application/json");
  try {
    const parsed = parseVisualJson(raw);
    const extractedText = sanitizeText(parsed?.extracted_text || "");
    const visualSummary = sanitizeText(parsed?.visual_summary || "");
    const rawFindings = Array.isArray(parsed?.visual_findings) ? parsed.visual_findings : [];
    const visualFindings = rawFindings
      .filter((f) => f && (f.reason || f.flagged_text))
      .slice(0, 6)
      .map((f) => ({
        id: "fnd_" + crypto.randomBytes(4).toString("hex"),
        type: "visual_compliance",
        severity: normalizeSeverity(f.severity),
        flagged_text: sanitizeText(f.flagged_text || "Visual element").slice(0, 140),
        rule_ref: sanitizeText(f.rule_ref || "Visual 4.1"),
        source_id: sanitizeText(f.source_id || "S-01"),
        reason: sanitizeText(f.reason || "Visual or logo compliance issue detected."),
        suggested_fix: f.suggested_fix ? sanitizeText(f.suggested_fix) : null,
        confidence:
          typeof f.confidence === "number" && Number.isFinite(f.confidence)
            ? Math.max(0.4, Math.min(0.99, f.confidence))
            : 0.78,
        status: "pending",
        creator_explanation: null,
        dismiss_reason: null
      }));
    return { extractedText, visualSummary, visualFindings };
  } catch {
    return {
      extractedText: sanitizeText(raw),
      visualSummary: "",
      visualFindings: []
    };
  }
}

function mergeFindingsIntoCheckResult(checkResult, visualFindings) {
  if (!visualFindings || visualFindings.length === 0) return checkResult;
  const existing = Array.isArray(checkResult.findings) ? checkResult.findings : [];
  const seen = new Set(
    existing.map((f) => `${f.rule_ref || ""}::${(f.flagged_text || "").toLowerCase()}`)
  );
  const combined = [...existing];
  for (const vf of visualFindings) {
    const key = `${vf.rule_ref || ""}::${(vf.flagged_text || "").toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      combined.push(vf);
    }
  }
  let riskLevel = "LOW";
  if (combined.some((f) => f.severity === "HIGH")) {
    riskLevel = "HIGH";
  } else if (combined.some((f) => f.severity === "MEDIUM") || combined.length >= 2) {
    riskLevel = "MEDIUM";
  }
  return {
    risk_level: riskLevel,
    findings_count: combined.length,
    findings: combined,
    summary: {
      high_severity_count: combined.filter((f) => f.severity === "HIGH").length,
      medium_severity_count: combined.filter((f) => f.severity === "MEDIUM").length,
      low_severity_count: combined.filter((f) => f.severity === "LOW").length,
      unverified_count: combined.filter((f) => f.type === "unverified_claim").length
    }
  };
}

async function handleFileUpload(body, user) {
  const filename = (body && body.filename ? String(body.filename) : "Uploaded_Draft.txt").trim();
  const ext = path.extname(filename).toLowerCase();
  let content = "";
  let visualSummary = "";
  let visualFindings = [];

  if (body && body.content && !body.file_base64) {
    content = String(body.content);
  } else if (body && body.file_base64) {
    const cleanBase64 = String(body.file_base64).replace(/^data:[^;]+;base64,/i, "").trim();
    const buffer = Buffer.from(cleanBase64, "base64");
    if (buffer.length > MAX_UPLOAD_BYTES) {
      return {
        status: 413,
        data: { error: "File is too large (max 6 MB). Please upload a smaller document or compressed image." }
      };
    }
    if (ext === ".docx") {
      try {
        content = extractTextFromDocx(buffer);
      } catch (err) {
        return { status: 422, data: { error: err.message || "Could not extract text from .docx file." } };
      }
    } else if (ext === ".pptx") {
      try {
        content = extractTextFromPptx(buffer);
      } catch (err) {
        return { status: 422, data: { error: err.message || "Could not extract text from .pptx file." } };
      }
    } else if (ext === ".doc" || ext === ".ppt") {
      return {
        status: 415,
        data: { error: `Legacy ${ext} binary format is not supported. Please save as .docx, .pptx, or .pdf.` }
      };
    } else if (MIME_BY_EXT[ext]) {
      const mimeType = MIME_BY_EXT[ext];
      try {
        if (mimeType.startsWith("image/")) {
          const analysis = await analyzeImageWithGemini(cleanBase64, mimeType, filename);
          content = analysis.extractedText;
          visualSummary = analysis.visualSummary;
          visualFindings = analysis.visualFindings;
        } else {
          content = await extractTextWithGemini(cleanBase64, mimeType, filename);
        }
      } catch (err) {
        return { status: 422, data: { error: err.message || `Could not extract text from ${ext} file.` } };
      }
    } else if (ext === ".rtf") {
      content = extractTextFromRtf(buffer.toString("utf-8"));
    } else if (!ext || TEXT_EXTENSIONS.has(ext)) {
      content = buffer.toString("utf-8");
      if (ext === ".html" || ext === ".htm" || ext === ".xml") {
        content = content
          .replace(/<script[\s\S]*?<\/script>/gi, " ")
          .replace(/<style[\s\S]*?<\/style>/gi, " ")
          .replace(/<[^>]+>/g, " ");
      }
    } else {
      return {
        status: 415,
        data: {
          error: `Unsupported file type (${ext}). Supported formats: .txt, .md, .csv, .json, .html, .rtf, .docx, .pptx, .pdf, .png, .jpg, .jpeg, .webp.`
        }
      };
    }
  } else {
    return {
      status: 400,
      data: { error: "No file content provided. Send file_base64 or content string." }
    };
  }

  let cleanContent = sanitizeText(content);
  if (!cleanContent && visualFindings.length === 0) {
    return {
      status: 422,
      data: { error: `No readable text could be extracted from ${filename}.` }
    };
  }
  if (!cleanContent && visualFindings.length > 0) {
    cleanContent = visualSummary || `[Visual creative uploaded: ${filename}]`;
  }

  let checkResult = await runCheckPipeline({
    text: cleanContent,
    title: filename,
    channel: (body && body.channel) || "General",
    product_code: (body && body.product_code) || null,
    creator_id: user ? user.id : "usr_creator_01"
  });
  checkResult = mergeFindingsIntoCheckResult(checkResult, visualFindings);

  return {
    status: 200,
    data: {
      filename,
      file_type: ext || ".txt",
      extracted_length: cleanContent.length,
      extracted_content: cleanContent,
      visual_summary: visualSummary || null,
      visual_findings_count: visualFindings.length,
      check_result: checkResult
    }
  };
}

module.exports = { handleFileUpload };