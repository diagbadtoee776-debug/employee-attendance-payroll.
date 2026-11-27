"use client";

import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/AuthProvider";
import { Modal, Notices, money } from "@/components/pay/shared";

type Method = "percent" | "fixed";
type Ded = { id: number; name: string; method: Method; value: number; active: boolean };

function friendly(m: string): string {
  if (m.includes("deduction_types_name_key")) return "A deduction with that name already exists.";
  if (m.includes("check constraint")) return "A percentage cannot be more than 100, and the value cannot be negative.";
  if (m.includes("row-level security")) return "You do not have permission to do that.";
  return m;
}

const describe = (d: Ded) => (d.method === "percent" ? `${d.value}% of gross pay` : `${money.format(d.value)} per period`);

export default function DeductionsTab() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [rows, setRows] = useState<Ded[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState<Ded | "new" | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      const { data, error: err } = await supabase
        .from("deduction_types")
        .select("id, name, method, value, active")
        .order("id");
      if (cancelled) return;
      if (err) {
        setError(err.message);
        setLoaded(true);
        return;
      }
      setRows(((data ?? []) as unknown as Ded[]).map((d) => ({ ...d, value: Number(d.value) })));
      setError(null);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, reload]);

  async function toggle(d: Ded) {
    setNotice(null);
    const { data, error: err } = await supabase
      .from("deduction_types")
      .update({ active: !d.active })
      .eq("id", d.id)
      .select("id");
    if (err || !data || data.length === 0) {
      setError(err ? friendly(err.message) : "You do not have permission to change this deduction.");
      return;
    }
    setError(null);
    setNotice(`${d.name} is now ${d.active ? "inactive" : "active"}.`);
    setReload((n) => n + 1);
  }

  async function remove(d: Ded) {
    if (!window.confirm(`Delete the deduction "${d.name}"? Past payslips keep their amounts.`)) return;
    setNotice(null);
    const { data, error: err } = await supabase.from("deduction_types").delete().eq("id", d.id).select("id");
    if (err || !data || data.length === 0) {
      setError(err ? friendly(err.message) : "You do not have permission to delete this deduction.");
      return;
    }
    setError(null);
    setNotice("Deduction deleted.");
    setReload((n) => n + 1);
  }

  return (
    <>
      <Notices notice={notice} error={error} />
      <div className="toolbar">
        <p className="cell-sub">Changes apply to future payroll runs. Payslips already created keep their amounts.</p>
        <button className="btn" style={{ marginLeft: "auto" }} onClick={() => setEditing("new")}>
          Add deduction
        </button>
      </div>

      <div className="card table-wrap">
        {!loaded ? (
          <p className="empty">Loading deductions...</p>
        ) : rows.length === 0 ? (
          <p className="empty">No deductions defined.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Deduction</th>
                <th>How it is calculated</th>
                <th>Status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id}>
                  <td className="cell-main">{d.name}</td>
                  <td>{describe(d)}</td>
                  <td>
                    <span className={`badge ${d.active ? "success" : ""}`}>{d.active ? "Active" : "Inactive"}</span>
                  </td>
                  <td>
                    <div className="actions">
                      <button className="btn small outline" onClick={() => setEditing(d)}>
                        Edit
                      </button>
                      <button className="btn small outline" onClick={() => toggle(d)}>
                        {d.active ? "Deactivate" : "Activate"}
                      </button>
                      <button className="btn small danger" onClick={() => remove(d)}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editing && (
        <DeductionForm
          initial={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(m) => {
            setEditing(null);
            setError(null);
            setNotice(m);
            setReload((n) => n + 1);
          }}
        />
      )}
    </>
  );
}

function DeductionForm({
  initial,
  onClose,
  onSaved,
}: {
  initial: Ded | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [method, setMethod] = useState<Method>(initial?.method ?? "percent");
  const [value, setValue] = useState(String(initial?.value ?? ""));
  const [active, setActive] = useState(initial?.active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const payload = { name: name.trim(), method, value: Number(value), active };
    if (initial) {
      const { data, error: err } = await supabase.from("deduction_types").update(payload).eq("id", initial.id).select("id");
      if (err || !data || data.length === 0) {
        setError(err ? friendly(err.message) : "You do not have permission to change this deduction.");
        setSaving(false);
        return;
      }
      onSaved("Deduction updated.");
    } else {
      const { error: err } = await supabase.from("deduction_types").insert(payload);
      if (err) {
        setError(friendly(err.message));
        setSaving(false);
        return;
      }
      onSaved("Deduction added.");
    }
  }

  return (
    <Modal title={initial ? "Edit deduction" : "Add deduction"} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="form-grid">
          <div className="field full">
            <label htmlFor="d-name">Name</label>
            <input id="d-name" className="input" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="d-method">Type</label>
            <select
              id="d-method"
              className="select"
              value={method}
              onChange={(e) => setMethod(e.target.value as Method)}
            >
              <option value="percent">Percent of gross pay</option>
              <option value="fixed">Fixed amount per period</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="d-value">{method === "percent" ? "Percent (0 to 100)" : "Amount (USD)"}</label>
            <input
              id="d-value"
              className="input"
              type="number"
              step="0.01"
              min="0"
              required
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>
          <div className="field full">
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
              Active (applied in payroll runs)
            </label>
          </div>
        </div>

        {error && (
          <p className="alert" role="alert">
            {error}
          </p>
        )}

        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn" disabled={saving}>
            {saving ? "Saving..." : initial ? "Save changes" : "Add deduction"}
          </button>
        </div>
      </form>
    </Modal>
  );
}