// File Upload & Multi-Format Draft Extraction Controller
// Supports: .txt, .md, .csv, .json, .html, .xml, .rtf, .docx, .pptx (zero-dependency pure Node)
// Plus multimodal Gemini extraction for: .pdf, .png, .jpg, .jpeg, .webp, .gif
const zlib = require("node:zlib");
const https = require("node:https");
const path = require("node:path");
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

function extractTextWithGemini(base64Data, mimeType, filename) {
  const apiKey = process.env.GEMINI_API_KEY || "";
  if (!apiKey) {
    return Promise.reject(
      new Error(
        "GEMINI_API_KEY is not configured on the backend server. PDF and image text extraction requires GEMINI_API_KEY in .env."
      )
    );
  }

  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const payload = JSON.stringify({
    contents: [
      {
        role: "user",
        parts: [
          {
            text:
              `Extract ALL readable marketing, ad, product, pricing, discount, claim, and caption text from this file (${filename}) verbatim. ` +
              "Return ONLY the extracted plain text with no commentary, markdown fences, or extra labels."
          },
          {
            inlineData: {
              mimeType,
              data: base64Data
            }
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0
    }
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
              return reject(new Error(msg));
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
    req.setTimeout(25000, () => {
      req.destroy(new Error("Timed out extracting text from file."));
    });
    req.write(payload);
    req.end();
  });
}

async function handleFileUpload(body, user) {
  const filename = (body && body.filename ? String(body.filename) : "Uploaded_Draft.txt").trim();
  const ext = path.extname(filename).toLowerCase();
  let content = "";

  if (body && body.content && !body.file_base64) {
    content = String(body.content);
  } else if (body && body.file_base64) {
    const cleanBase64 = String(body.file_base64).replace(/^data:[^;]+;base64,/i, "").trim();
    const buffer = Buffer.from(cleanBase64, "base64");

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
      try {
        content = await extractTextWithGemini(cleanBase64, MIME_BY_EXT[ext], filename);
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

  const cleanContent = sanitizeText(content);
  if (!cleanContent) {
    return {
      status: 422,
      data: { error: `No readable text could be extracted from ${filename}.` }
    };
  }

  const checkResult = await runCheckPipeline({
    text: cleanContent,
    title: filename,
    channel: (body && body.channel) || "General",
    product_code: (body && body.product_code) || null,
    creator_id: user ? user.id : "usr_creator_01"
  });

  return {
    status: 200,
    data: {
      filename,
      file_type: ext || ".txt",
      extracted_length: cleanContent.length,
      extracted_content: cleanContent,
      check_result: checkResult
    }
  };
}

module.exports = { handleFileUpload };