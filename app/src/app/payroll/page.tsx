"use client";

import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/AuthProvider";
import AppShell from "@/components/AppShell";

type PStatus = "open" | "processed" | "closed";
type Period = { id: number; label: string; start_date: string; end_date: string; status: PStatus };
type Totals = { count: number; net: number };

const STATUS_LABEL: Record<PStatus, string> = { open: "Open", processed: "Processed", closed: "Closed" };
const STATUS_CLASS: Record<PStatus, string> = { open: "warn", processed: "success", closed: "" };
const filterLabel: CSSProperties = { display: "grid", gap: 4, fontSize: 12, color: "var(--muted)" };
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

// Turn database rule errors into plain language
function friendly(m: string): string {
  if (m.includes("exclusion constraint")) return "These dates overlap an existing pay period.";
  if (m.includes("pay_periods_label_key")) return "A pay period with that name already exists.";
  if (m.includes("check constraint")) return "The end date must be on or after the start date.";
  if (m.includes("foreign key")) return "This period already has payslips, so it cannot be deleted.";
  if (m.includes("row-level security")) return "You do not have permission to do that.";
  return m;
}

export default function PayrollPage() {
  const { user, role } = useAuth();
  const userId = user?.id ?? null;
  const canRun = role === "admin" || role === "payroll";

  const [periods, setPeriods] = useState<Period[]>([]);
  const [totals, setTotals] = useState<Map<number, Totals>>(new Map());
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [runningId, setRunningId] = useState<number | null>(null);

  const [label, setLabel] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      const [p, s] = await Promise.all([
        supabase
          .from("pay_periods")
          .select("id, label, start_date, end_date, status")
          .order("start_date", { ascending: false }),
        supabase.from("payslips").select("period_id, net_pay"),
      ]);
      if (cancelled) return;
      if (p.error) {
        setError(p.error.message);
        setLoaded(true);
        return;
      }
      const map = new Map<number, Totals>();
      ((s.data ?? []) as unknown as { period_id: number; net_pay: number }[]).forEach((r) => {
        const t = map.get(r.period_id) ?? { count: 0, net: 0 };
        t.count += 1;
        t.net += Number(r.net_pay);
        map.set(r.period_id, t);
      });
      setPeriods((p.data ?? []) as unknown as Period[]);
      setTotals(map);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, reload]);

  async function create(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    setNotice(null);
    const { error: err } = await supabase
      .from("pay_periods")
      .insert({ label: label.trim(), start_date: start, end_date: end });
    setCreating(false);
    if (err) {
      setError(friendly(err.message));
      return;
    }
    setLabel("");
    setStart("");
    setEnd("");
    setNotice("Pay period created.");
    setReload((n) => n + 1);
  }

  async function run(p: Period) {
    if (
      !window.confirm(
        `Run payroll for ${p.label}? This creates a payslip for every active employee and cannot be run twice.`
      )
    )
      return;
    setRunningId(p.id);
    setError(null);
    setNotice(null);
    const { data, error: err } = await supabase.rpc("calculate_payroll", { p_period_id: p.id });
    setRunningId(null);
    if (err) {
      setError(`Payroll could not be completed, and nothing was saved. ${friendly(err.message)}`);
      return;
    }
    setNotice(`Payroll complete: ${data} payslips created for ${p.label}.`);
    setReload((n) => n + 1);
  }

  async function remove(p: Period) {
    if (!window.confirm(`Delete the pay period "${p.label}"?`)) return;
    setError(null);
    setNotice(null);
    const { data, error: err } = await supabase.from("pay_periods").delete().eq("id", p.id).select("id");
    if (err) {
      setError(friendly(err.message));
      return;
    }
    if (!data || data.length === 0) {
      setError("You do not have permission to delete this period.");
      return;
    }
    setNotice("Pay period deleted.");
    setReload((n) => n + 1);
  }

  return (
    <AppShell title="Run payroll" subtitle="Create pay periods and process payroll. A period can be processed only once.">
      {notice && (
        <p className="notice-ok" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}

      {canRun && (
        <section className="section">
          <h2 className="section-title">New pay period</h2>
          <form className="card toolbar" onSubmit={create} style={{ marginBottom: 0 }}>
            <label style={{ ...filterLabel, flex: 1, minWidth: 200 }}>
              Name
              <input
                className="input"
                required
                placeholder="Dec 2026 Cycle 1"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </label>
            <label style={filterLabel}>
              Start date
              <input className="input" type="date" required value={start} onChange={(e) => setStart(e.target.value)} />
            </label>
            <label style={filterLabel}>
              End date
              <input className="input" type="date" required value={end} onChange={(e) => setEnd(e.target.value)} />
            </label>
            <button className="btn" type="submit" disabled={creating} style={{ alignSelf: "end" }}>
              {creating ? "Creating..." : "Create period"}
            </button>
          </form>
        </section>
      )}

      <div className="card table-wrap">
        {!loaded ? (
          <p className="empty">Loading pay periods...</p>
        ) : periods.length === 0 ? (
          <p className="empty">No pay periods yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Period</th>
                <th>Dates</th>
                <th>Status</th>
                {canRun && <th>Payslips</th>}
                {canRun && <th>Total net pay</th>}
                {canRun && <th aria-label="Actions" />}
              </tr>
            </thead>
            <tbody>
              {periods.map((p) => {
                const t = totals.get(p.id);
                return (
                  <tr key={p.id}>
                    <td className="cell-main">{p.label}</td>
                    <td>
                      {p.start_date} to {p.end_date}
                    </td>
                    <td>
                      <span className={`badge ${STATUS_CLASS[p.status]}`}>{STATUS_LABEL[p.status]}</span>
                    </td>
                    {canRun && <td>{t?.count ?? 0}</td>}
                    {canRun && <td>{t ? money.format(t.net) : "-"}</td>}
                    {canRun && (
                      <td>
                        <div className="actions">
                          {p.status === "open" && (
                            <button className="btn small" disabled={runningId !== null} onClick={() => run(p)}>
                              {runningId === p.id ? "Running..." : "Run payroll"}
                            </button>
                          )}
                          {p.status === "open" && !t && (
                            <button className="btn small danger" onClick={() => remove(p)}>
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </AppShell>
  );
}