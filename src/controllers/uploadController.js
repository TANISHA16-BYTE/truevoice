// File Upload & Draft Extraction Controller
const { runCheckPipeline } = require("../services/checkPipeline");

async function handleFileUpload(body, user) {
  let content = "";
  let filename = body.filename || "Uploaded_Draft.txt";
  
  if (body.file_base64) {
    const buffer = Buffer.from(body.file_base64, "base64");
    content = buffer.toString("utf-8");
  } else if (body.content) {
    content = body.content;
  } else {
    return { status: 400, data: { error: "No file content provided. Send file_base64 or content string." } };
  }

  // Sanitize input (strip non-printable characters while preserving paragraph breaks)
  const cleanContent = content.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "").trim();
  
  const checkResult = await runCheckPipeline({
    text: cleanContent,
    title: filename,
    channel: body.channel || "General",
    product_code: body.product_code || null,
    creator_id: user ? user.id : "usr_creator_01"
  });

  return {
    status: 200,
    data: {
      filename,
      extracted_length: cleanContent.length,
      extracted_content: cleanContent,
      check_result: checkResult
    }
  };
}

module.exports = { handleFileUpload };
