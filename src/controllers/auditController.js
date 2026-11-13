// Regulatory Compliance Audit Export Controller (CSV & JSON)
const db = require("../db/database");

function exportAuditLogs(query) {
  const format = (query.format || "json").toLowerCase();
  
  const history = db.query(`
    SELECT h.id, h.draft_id, d.title as draft_title, d.channel, d.risk_level,
           h.actor_id, h.actor_name, h.action, h.details, h.timestamp
    FROM draft_history h
    LEFT JOIN drafts d ON h.draft_id = d.id
    ORDER BY h.timestamp DESC
  `);

  if (format === "csv") {
    const headers = ["History_ID", "Draft_ID", "Draft_Title", "Channel", "Risk_Level", "Actor_Name", "Action", "Details", "Timestamp"];
    const rows = history.map(h => [
      h.id,
      h.draft_id,
      JSON.stringify(h.draft_title || ""),
      h.channel || "",
      h.risk_level || "",
      JSON.stringify(h.actor_name || ""),
      h.action,
      JSON.stringify(h.details || ""),
      h.timestamp
    ].join(","));

    const csvContent = [headers.join(","), ...rows].join("\n");
    return {
      status: 200,
      contentType: "text/csv",
      headers: {
        "Content-Disposition": "attachment; filename=\"truevoice_audit_log_" + Date.now() + ".csv\""
      },
      raw: csvContent
    };
  }

  return {
    status: 200,
    contentType: "application/json",
    data: {
      generated_at: new Date().toISOString(),
      total_events: history.length,
      audit_events: history
    }
  };
}

module.exports = { exportAuditLogs };
