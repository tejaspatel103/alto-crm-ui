import { useEffect, useState } from "react";
import { apiGet } from "../api/client";

export default function LeadGrid() {
  const [fields, setFields] = useState([]);
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    try {
      setLoading(true);

      const fieldDefs = await apiGet("/api/fields");
      const leadResp = await apiGet("/api/leads?page=1&page_size=25");

      setFields(fieldDefs);
      setLeads(leadResp.data);
    } catch (err) {
      setError(err.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (loading) return <div className="grid">Loading leads…</div>;
  if (error) return <div className="grid error">{error}</div>;

  return (
    <div className="grid">
      <div className="grid-table-wrapper">
        <table className="grid-table">
          <thead>
            <tr>
              {fields.map((f) => (
                <th key={f.id}>{f.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr key={lead.id}>
                {fields.map((f) => {
                  const cell = lead.fields?.[f.id] || {};
                  return (
                    <td key={f.id}>
                      {cell.value ?? ""}
                      {cell.locked && " 🔒"}
                      {cell.source === "ai" && " 🤖"}
                      {cell.source === "integration" && " ⚡"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
