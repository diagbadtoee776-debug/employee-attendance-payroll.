"use client";

import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/AuthProvider";
import { Modal, Notices, filterLabel, first, money } from "@/components/pay/shared";

type Emp = { employee_no: string; first_name: string; last_name: string };
type Raw = {
  id: number;
  employee_id: number;
  hourly_rate: number;
  overtime_multiplier: number;
  effective_from: string;
  effective_to: string | null;
  employees: Emp | Emp[] | null;
};
type Row = {
  id: number;
  employee_id: number;
  rate: number;
  ot: number;
  from: string;
  to: string | null;
  emp_no: string;
  emp_name: string;
};
type Opt = { id: number; label: string };

const today = () => new Date().toISOString().slice(0, 10);

function stateOf(r: Row): { label: string; cls: string } {
  const t = today();
  if (r.from > t) return { label: "Scheduled", cls: "warn" };
  if (r.to && r.to < t) return { label: "Ended", cls: "" };
  return { label: "Current", cls: "success" };
}

// Turn database rule errors into plain language
function friendly(m: string): string {
  if (m.includes("exclusion constraint") || m.includes("conflicting key"))
    return "These dates overlap another rate for the same employee. End the earlier rate first by giving it an end date.";
  if (m.includes("hourly_rate_check")) return "The hourly rate must be greater than zero.";
  if (m.includes("overtime_multiplier_check")) return "The overtime multiplier must be at least 1.";
  if (m.includes("check constraint")) return "The end date must be on or after the start date.";
  if (m.includes("row-level security")) return "You do not have permission to do that.";
  return m;
}

export default function PayRatesTab() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [rows, setRows] = useState<Row[]>([]);
  const [emps, setEmps] = useState<Opt[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [empFilter, setEmpFilter] = useState("all");
  const [editing, setEditing] = useState<Row | "new" | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      const [r, e] = await Promise.all([
        supabase
          .from("pay_rates")
          .select(
            "id, employee_id, hourly_rate, overtime_multiplier, effective_from, effective_to, employees(employee_no, first_name, last_name)"
          )
          .order("employee_id")
          .order("effective_from", { ascending: false }),
        supabase.from("employees").select("id, employee_no, first_name, last_name").order("employee_no"),
      ]);
      if (cancelled) return;
      if (r.error) {
        setError(r.error.message);
        setLoaded(true);
        return;
      }
      setRows(
        (r.data as unknown as Raw[]).map((x): Row => {
          const emp = first(x.employees);
          return {
            id: x.id,
            employee_id: x.employee_id,
            rate: Number(x.hourly_rate),
            ot: Number(x.overtime_multiplier),
            from: x.effective_from,
            to: x.effective_to,
            emp_no: emp?.employee_no ?? "-",
            emp_name: emp ? `${emp.first_name} ${emp.last_name}` : "-",
          };
        })
      );
      setEmps(
        ((e.data ?? []) as unknown as { id: number; employee_no: string; first_name: string; last_name: string }[]).map(
          (x) => ({ id: x.id, label: `${x.employee_no} · ${x.first_name} ${x.last_name}` })
        )
      );
      setError(null);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, reload]);

  async function remove(r: Row) {
    if (!window.confirm(`Delete this rate for ${r.emp_name} (from ${r.from})?`)) return;
    setNotice(null);
    const { data, error: err } = await supabase.from("pay_rates").delete().eq("id", r.id).select("id");
    if (err) {
      setError(friendly(err.message));
      return;
    }
    if (!data || data.length === 0) {
      setError("You do not have permission to delete this rate.");
      return;
    }
    setError(null);
    setNotice("Pay rate deleted.");
    setReload((n) => n + 1);
  }

  const shown = rows.filter((r) => empFilter === "all" || String(r.employee_id) === empFilter);

  return (
    <>
      <Notices notice={notice} error={error} />
      <div className="toolbar">
        <label style={filterLabel}>
          Employee
          <select className="select" value={empFilter} onChange={(e) => setEmpFilter(e.target.value)}>
            <option value="all">All employees</option>
            {emps.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <button className="btn" style={{ marginLeft: "auto", alignSelf: "end" }} onClick={() => setEditing("new")}>
          Add pay rate
        </button>
      </div>

      <div className="card table-wrap">
        {!loaded ? (
          <p className="empty">Loading pay rates...</p>
        ) : shown.length === 0 ? (
          <p className="empty">No pay rates found.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Hourly rate</th>
                <th>Overtime</th>
                <th>From</th>
                <th>To</th>
                <th>Status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const s = stateOf(r);
                return (
                  <tr key={r.id}>
                    <td>
                      <p className="cell-main">{r.emp_name}</p>
                      <p className="cell-sub">{r.emp_no}</p>
                    </td>
                    <td>{money.format(r.rate)}</td>
                    <td>x {r.ot}</td>
                    <td>{r.from}</td>
                    <td>{r.to ?? "open"}</td>
                    <td>
                      <span className={`badge ${s.cls}`}>{s.label}</span>
                    </td>
                    <td>
                      <div className="actions">
                        <button className="btn small outline" onClick={() => setEditing(r)}>
                          Edit
                        </button>
                        <button className="btn small danger" onClick={() => remove(r)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {editing && (
        <RateForm
          initial={editing === "new" ? null : editing}
          emps={emps}
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

function RateForm({
  initial,
  emps,
  onClose,
  onSaved,
}: {
  initial: Row | null;
  emps: Opt[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [employeeId, setEmployeeId] = useState(String(initial?.employee_id ?? emps[0]?.id ?? ""));
  const [rate, setRate] = useState(String(initial?.rate ?? ""));
  const [ot, setOt] = useState(String(initial?.ot ?? "1.5"));
  const [from, setFrom] = useState(initial?.from ?? today());
  const [to, setTo] = useState(initial?.to ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const payload = {
      employee_id: Number(employeeId),
      hourly_rate: Number(rate),
      overtime_multiplier: Number(ot),
      effective_from: from,
      effective_to: to || null,
    };
    if (initial) {
      const { data, error: err } = await supabase.from("pay_rates").update(payload).eq("id", initial.id).select("id");
      if (err || !data || data.length === 0) {
        setError(err ? friendly(err.message) : "You do not have permission to change this rate.");
        setSaving(false);
        return;
      }
      onSaved("Pay rate updated.");
    } else {
      const { error: err } = await supabase.from("pay_rates").insert(payload);
      if (err) {
        setError(friendly(err.message));
        setSaving(false);
        return;
      }
      onSaved("Pay rate added.");
    }
  }

  return (
    <Modal title={initial ? "Edit pay rate" : "Add pay rate"} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="form-grid">
          <div className="field full">
            <label htmlFor="r-emp">Employee</label>
            <select
              id="r-emp"
              className="select"
              required
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
            >
              {emps.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="r-rate">Hourly rate (USD)</label>
            <input
              id="r-rate"
              className="input"
              type="number"
              step="0.01"
              min="0.01"
              required
              value={rate}
              onChange={(e) => setRate(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="r-ot">Overtime multiplier</label>
            <input
              id="r-ot"
              className="input"
              type="number"
              step="0.05"
              min="1"
              required
              value={ot}
              onChange={(e) => setOt(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="r-from">Effective from</label>
            <input
              id="r-from"
              className="input"
              type="date"
              required
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="r-to">Effective to (leave empty if open)</label>
            <input id="r-to" className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>

        <p className="cell-sub" style={{ marginBottom: 12 }}>
          To give a raise, first set an end date on the current rate, then add the new rate starting the day after.
        </p>

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
            {saving ? "Saving..." : initial ? "Save changes" : "Add pay rate"}
          </button>
        </div>
      </form>
    </Modal>
  );
}