import { isValidEmail, isValidPhone } from "../utils/validation";
import { useEffect, useState, useRef } from "react";
import { apiGet, apiPatch } from "../api/client";

/**
 * Inline editable Lead Grid (Step 7.2 enhanced)
 */

export default function LeadGrid() {
  const [fields, setFields] = useState([]);
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
 const [inputDirty, setInputDirty] = useState(false);
const [validationErrors, setValidationErrors] = useState({});
const debounceRef = useRef(null);
  const [savingCells, setSavingCells] = useState({});
  const [cellErrors, setCellErrors] = useState({});
  const [lastEdit, setLastEdit] = useState(null);

  const inputRef = useRef(null);

  async function load(page = 1) {
    try {
      setLoading(true);
      setError("");
      const [fieldDefs, leadResp] = await Promise.all([
        apiGet("/api/fields"),
        apiGet(`/api/leads?page=${page}&page_size=25`)
      ]);

      setFields(fieldDefs);
      setLeads(leadResp.data);
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(1);
  }, []);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      const val = inputRef.current.value;
      inputRef.current.setSelectionRange(val.length, val.length);
    }
  }, [editing]);

  if (loading) return <div className="grid">Loading leads…</div>;
  if (error) return <div className="grid error">{error}</div>;

  function makeCellKey(leadId, fieldKey) {
    return `${leadId}:${fieldKey}`;
  }

  function startEdit(leadId, fieldKey, currentValue) {
    setCellErrors(prev => {
      const copy = { ...prev };
      delete copy[makeCellKey(leadId, fieldKey)];
      return copy;
    });

    setEditing({ leadId, fieldKey });
    setCellInput(currentValue ?? "");
  }

  async function commitEdit(leadId, fieldKey) {
    const key = makeCellKey(leadId, fieldKey);

    // 🔴 Step 7.3 — STOP if validation error exists
    const err = validationErrors[key];
    if (err) {
      console.warn("⛔ Blocked save due to validation:", err);
      return; // Do NOT save, stays in edit mode
    }

    const oldValue =
      leads.find(l => l.id === leadId)?.fields?.[fieldKey]?.value ?? "";
    const newValue = cellInput;

    // No change -> exit
    if (String(oldValue ?? "") === String(newValue ?? "")) {
      setEditing(null);
      return;
    }

    // mark saving
    setSavingCells(prev => ({ ...prev, [key]: true }));
    setCellErrors(prev => {
      const copy = { ...prev };
      delete copy[key];
      return copy;
    });

    try {
      // call PATCH API: send only the changed field
      await apiPatch(`/api/leads/${leadId}`, { [fieldKey]: newValue });

      // update local state
      setLeads(prevLeads =>
        prevLeads.map(l => {
          if (l.id !== leadId) return l;
          const newFields = { ...l.fields };
          newFields[fieldKey] = {
            ...(newFields[fieldKey] || {}),
            value: newValue,
            source: "manual",
            locked: false
          };
          return { ...l, fields: newFields };
        })
      );

      // allow undo
      setLastEdit({ leadId, fieldKey, oldValue, newValue });
    } catch (err) {
      console.error(err);
      setCellErrors(prev => ({ ...prev, [key]: err.message || "Save failed" }));
    } finally {
      setSavingCells(prev => {
        const copy = { ...prev };
        delete copy[key];
        return copy;
      });

      setEditing(null);
    }
}


    setSavingCells(prev => ({ ...prev, [key]: true }));
    setCellErrors(prev => {
      const copy = { ...prev };
      delete copy[key];
      return copy;
    });

    try {
      await apiPatch(`/api/leads/${leadId}`, { [fieldKey]: newValue });

      setLeads(prevLeads =>
        prevLeads.map(l => {
          if (l.id !== leadId) return l;
          const newFields = { ...l.fields };
          newFields[fieldKey] = {
            ...(newFields[fieldKey] || {}),
            value: newValue,
            source: "manual",
            locked: false
          };
          return { ...l, fields: newFields };
        })
      );

      setLastEdit({ leadId, fieldKey, oldValue, newValue });
    } catch (err) {
      console.error(err);
      setCellErrors(prev => ({ ...prev, [key]: err.message || "Save failed" }));
    } finally {
      setSavingCells(prev => {
        const copy = { ...prev };
        delete copy[key];
        return copy;
      });

      setEditing(null);
    }
  }

  async function handleUndo() {
    if (!lastEdit) return;

    const { leadId, fieldKey, oldValue } = lastEdit;
    const key = makeCellKey(leadId, fieldKey);

    setSavingCells(prev => ({ ...prev, [key]: true }));

    try {
      await apiPatch(`/api/leads/${leadId}`, { [fieldKey]: oldValue });

      setLeads(prevLeads =>
        prevLeads.map(l => {
          if (l.id !== leadId) return l;
          const newFields = { ...l.fields };
          newFields[fieldKey] = {
            ...(newFields[fieldKey] || {}),
            value: oldValue,
            source: "manual",
            locked: false
          };
          return { ...l, fields: newFields };
        })
      );

      setLastEdit(null);
    } catch (err) {
      setCellErrors(prev => ({ ...prev, [key]: err.message || "Undo failed" }));
    } finally {
      setSavingCells(prev => {
        const copy = { ...prev };
        delete copy[key];
        return copy;
      });
    }
  }

  /**
   * STEP 7.2 — Enhanced renderCellContent()
   */
  function renderCellContent(lead, f) {
    const cell = lead.fields?.[f.id] || {};
    const value = cell.value ?? "";
    const locked = cell.locked === true;
    const source = cell.source || "manual";
    const confidence = cell.confidence;

    const key = makeCellKey(lead.id, f.id);
    const saving = !!savingCells[key];
    const err = cellErrors[key];

    const isIntegration = source === "integration" || source.startsWith("integration");
    const isAI = source === "ai" || source.startsWith("ai");

    const sourceIcon = isAI ? "🤖" : isIntegration ? "⚡" : "👤";
    const sourceColor = isAI ? "#6a5acd" : isIntegration ? "#d2691e" : "#444";
    const textColor = locked ? "#999" : isIntegration ? "#777" : "#000";

    const tooltip = `
      Source: ${source}
      ${locked ? "Locked: Yes" : ""}
      ${confidence ? "Confidence: " + confidence : ""}
    `.trim();

    // EDIT MODE
    if (editing && editing.leadId === lead.id && editing.fieldKey === f.id) {
      return (
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input
            ref={inputRef}
            value={cellInput}
           onChange={(e) => {
  const v = e.target.value;
  setCellInput(v);
  setInputDirty(true);

  // Clear existing debounce
  if (debounceRef.current) clearTimeout(debounceRef.current);

  // Validate
  let err = null;
  if (f.id.toLowerCase().includes("email") && !isValidEmail(v)) {
    err = "Invalid email";
  }
  if (f.id.toLowerCase().includes("phone") && !isValidPhone(v)) {
    err = "Invalid phone";
  }

  setValidationErrors((prev) => ({
    ...prev,
    [makeCellKey(lead.id, f.id)]: err,
  }));

  // Only autosave if no validation errors
  if (!err) {
    debounceRef.current = setTimeout(() => {
      commitEdit(lead.id, f.id);
    }, 600);
  }
}}

            onBlur={() => commitEdit(lead.id, f.id)}
            onKeyDown={e => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitEdit(lead.id, f.id);
              } else if (e.key === "Escape") {
                setEditing(null);
              }
            }}
            style={{
  minWidth: 120,
  border: validationErrors[makeCellKey(lead.id, f.id)] ? "1px solid red" : "1px solid #ccc",
}}

          />
          {saving && <span>Saving…</span>}
          {err && <span style={{ color: "red" }}>{err}</span>}
        </div>
      );
    }

    // DISPLAY MODE
    return (
      <div
        title={tooltip}
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 8,
          alignItems: "center",
          color: textColor,
          opacity: locked ? 0.6 : 1
        }}
      >
        <div
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            maxWidth: 260
          }}
        >
          {String(value)}
        </div>

        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <span style={{ color: sourceColor }}>{sourceIcon}</span>
          {locked && <span>🔒</span>}
          {saving && <span>…</span>}
        </div>
      </div>
    );
  }

  function onCellDoubleClick(lead, f) {
    const cell = lead.fields?.[f.id] || {};
    const locked = cell.locked === true;
    const isIntegration = cell.source === "integration" || cell.source?.startsWith("integration");

    if (!f.is_editable) return;
    if (locked) return;
    if (isIntegration) return;

    startEdit(lead.id, f.id, cell.value ?? "");
  }

  return (
    <div className="grid">
      <div style={{ marginBottom: 8 }}>
        {lastEdit ? (
          <div>
            Last edit: {lastEdit.fieldKey} on {lastEdit.leadId} — changed from "
            {String(lastEdit.oldValue)}" to "{String(lastEdit.newValue)}"
            <button style={{ marginLeft: 8 }} onClick={handleUndo}>
              Undo
            </button>
          </div>
        ) : (
          <div>No edits yet</div>
        )}
      </div>

      <div className="grid-table-wrapper">
        <table className="grid-table">
          <thead>
            <tr>
              <th>ID</th>
              {fields.map((f) => (
                <th key={f.id}>{f.label}</th>
              ))}
            </tr>
          </thead>

          <tbody>
            {leads.map((lead) => (
              <tr key={lead.id}>
                <td className="id-cell">{lead.id}</td>

                {fields.map((f) => {
                  const cell = lead.fields?.[f.id] || {};
                  const locked = cell.locked === true;
                  const isIntegration =
                    cell.source === "integration" || cell.source?.startsWith("integration");

                  return (
                    <td
                      key={f.id}
                      onDoubleClick={() => onCellDoubleClick(lead, f)}
                      style={{
                        cursor:
                          f.is_editable && !locked && !isIntegration
                            ? "pointer"
                            : "not-allowed",
                        background: locked
                          ? "#f4f4f4"
                          : isIntegration
                          ? "#faf8f0"
                          : "white"
                      }}
                    >
                      {renderCellContent(lead, f)}
                    </td>
                  );
                })}

              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {error && <p style={{ color: "red", marginTop: 8 }}>{error}</p>}
    </div>
  );
}
