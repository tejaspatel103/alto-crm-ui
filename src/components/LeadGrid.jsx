import { useEffect, useState, useRef } from "react";
import { apiGet, apiPatch } from "../api/client";

/**
 * Inline editable Lead Grid (Step 7.1)
 *
 * Behaviors:
 * - Double-click a cell to edit (only if field.is_editable and cell not locked)
 * - Enter or blur saves via PATCH /api/leads/:id
 * - Stores a single lastEdit to allow Undo (client-side only)
 * - Shows saving / error states per-cell
 */

export default function LeadGrid() {
  const [fields, setFields] = useState([]);
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null); // { leadId, fieldKey }
  const [cellInput, setCellInput] = useState("");
  const [savingCells, setSavingCells] = useState({}); // map "leadId:field" -> true
  const [cellErrors, setCellErrors] = useState({}); // map "leadId:field" -> error msg
  const [lastEdit, setLastEdit] = useState(null); // { leadId, fieldKey, oldValue, newValue }

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
    // focus input when entering edit mode
    if (editing && inputRef.current) {
      inputRef.current.focus();
      // move cursor to end
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
    const oldValue = (leads.find(l => l.id === leadId)?.fields?.[fieldKey]?.value) ?? "";
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

      // update local state (immutable)
      setLeads(prevLeads =>
        prevLeads.map(l => {
          if (l.id !== leadId) return l;
          const newFields = { ...l.fields };
          newFields[fieldKey] = {
            ...(newFields[fieldKey] || {}),
            value: newValue,
            source: "manual",
            // keep locked as-is — backend will set lock false via upsertFieldMeta
            locked: false
          };
          return { ...l, fields: newFields };
        })
      );

      // set last edit for undo
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

    // optimistic UI update
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

  function renderCellContent(lead, f) {
    const cell = lead.fields?.[f.id] || {};
    const value = cell.value ?? "";
    const locked = cell.locked === true;
    const source = cell.source || "manual";
    const key = makeCellKey(lead.id, f.id);
    const saving = !!savingCells[key];
    const err = cellErrors[key];

    // If this cell is currently in edit mode for this lead+field, render input
    if (editing && editing.leadId === lead.id && editing.fieldKey === f.id) {
      return (
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input
            ref={inputRef}
            value={cellInput}
            onChange={e => setCellInput(e.target.value)}
            onBlur={() => commitEdit(lead.id, f.id)}
            onKeyDown={e => {
              if (e.key === "Enter") {
                // prevent line breaks from doing anything special
                e.preventDefault();
                commitEdit(lead.id, f.id);
              } else if (e.key === "Escape") {
                setEditing(null);
              }
            }}
            style={{ minWidth: 120 }}
          />
          {saving && <span>Saving…</span>}
          {err && <span style={{ color: "red" }}>{err}</span>}
        </div>
      );
    }

    // Normal display mode
    return (
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <div style={{ overflow: "hidden", textOverflow: "ellipsis", maxWidth: 400 }}>
          {String(value)}
        </div>

        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          {/* source icon */}
          <span title={`source: ${source}`}>
            {source && source.startsWith("ai") ? "🤖" : source && source.startsWith("integration") ? "⚡" : "👤"}
          </span>

          {/* locked */}
          {locked && <span title="Locked">🔒</span>}

          {/* saving indicator if any */}
          {saving && <span>…</span>}
        </div>
      </div>
    );
  }

  // cell double click handler
  function onCellDoubleClick(lead, f) {
    const cell = lead.fields?.[f.id] || {};
    const locked = cell.locked === true;

    // only allow edit if crm field says editable and not locked
    if (!f.is_editable) return;
    if (locked) return;

    startEdit(lead.id, f.id, cell.value ?? "");
  }

  return (
    <div className="grid">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div>
          {lastEdit ? (
            <div>
              Last edit: {lastEdit.fieldKey} on {lastEdit.leadId} — changed from "{String(lastEdit.oldValue)}" to "{String(lastEdit.newValue)}"
              <button style={{ marginLeft: 8 }} onClick={handleUndo}>Undo</button>
            </div>
          ) : (
            <div>No edits yet</div>
          )}
        </div>
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
                {fields.map((f) => (
                  <td
                    key={f.id}
                    onDoubleClick={() => onCellDoubleClick(lead, f)}
                    style={{ cursor: f.is_editable ? "pointer" : "default" }}
                    title={f.is_editable ? "Double-click to edit" : ""}
                  >
                    {renderCellContent(lead, f)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* optional global error */}
      {error && <p style={{ color: "red", marginTop: 8 }}>{error}</p>}
    </div>
  );
}
