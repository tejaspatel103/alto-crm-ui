import { useEffect, useState } from "react";
import { apiGet } from "../api/client";

export default function LeadGrid() {
  const [fields, setFields] = useState([]);
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const fieldDefs = await apiGet("/api/fields");
        const leadResp = await apiGet("/api/leads");
        setFields(fieldDefs || []);
        setLeads(leadResp?.data || []);
      } catch (err) {
        setError(err.message || "Failed to load");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <div>Loading…</div>;
  if (error) return <div style={{ color: "red" }}>{error}</div>;

  return (
    <div>
      <h2>Leads</h2>
      <table border="1" cellPadding="6">
        <thead>
          <tr>
            <th>ID</th>
            {fields.map(f => (
              <th key={f.id}>{f.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {leads.map(lead => (
            <tr key={lead.id}>
              <td>{lead.id}</td>
              {fields.map(f => (
                <td key={f.id}>
                  {String(lead.fields?.[f.id]?.value ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
