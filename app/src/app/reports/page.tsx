"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/AuthProvider";
import AppShell from "@/components/AppShell";

type Tab = "payroll" | "absence" | "overtime";

type Period = { id: number; label: string; status: string };
type SummaryRow = {
  period: string;
  department: string;
  employees_paid: number;
  total_gross: number;
  total_deductions: number;
  total_net: number;
};
type AbsenceRow = {
  period: string;
  employee_no: string;
  employee: string;
  days_absent: number;
  days_late: number;
};
type Emp = { employee_no: string; first_name: string; last_name: string };
type Per = { label: string };
type RawSlip = {
  regular_hours: number;
  overtime_hours: number;
  gross_pay: number;
  net_pay: number;
  employees: Emp | Emp[] | null;
  pay_periods: Per | Per[] | null;
};
type SlipRow = {
  period: string;
  emp_no: string;
  emp_name: string;
  regular: number;
  overtime: number;
  gross: number;
  net: number;
};

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const filterLabel: CSSProperties = { display: "grid", gap: 4, fontSize: 12, color: "var(--muted)" };
const footCell: CSSProperties = { fontWeight: 700, background: "var(--surface-2)" };

function first<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

export default function ReportsPage() {
  const { user, role } = useAuth();
  const userId = user?.id ?? null;
  const isPayrollSide = role === "admin" || role === "payroll";

  const [tab, setTab] = useState<Tab | null>(null);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [periodChoice, setPeriodChoice] = useState("");
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [absence, setAbsence] = useState<AbsenceRow[]>([]);
  const [slips, setSlips] = useState<SlipRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId || !role) return;
    let cancelled = false;
    (async () => {
      const [p, a, s, ps] = await Promise.all([
        supabase.from("pay_periods").select("id, label, status").order("start_date", { ascending: false }),
        supabase.from("v_absence_report").select("*"),
        isPayrollSide ? supabase.from("v_payroll_summary").select("*") : Promise.resolve(null),
        isPayrollSide
          ? supabase
              .from("payslips")
              .select(
                "regular_hours, overtime_hours, gross_pay, net_pay, employees(employee_no, first_name, last_name), pay_periods(label)"
              )
          : Promise.resolve(null),
      ]);
      if (cancelled) return;
      if (p.error || a.error) {
        setError((p.error ?? a.error)!.message);
        setLoaded(true);
        return;
      }
      setPeriods((p.data ?? []) as unknown as Period[]);
      setAbsence(
        ((a.data ?? []) as unknown as AbsenceRow[]).map((r) => ({
          ...r,
          days_absent: Number(r.days_absent),
          days_late: Number(r.days_late),
        }))
      );
      setSummary(
        ((s?.data ?? []) as unknown as SummaryRow[]).map((r) => ({
          ...r,
          employees_paid: Number(r.employees_paid),
          total_gross: Number(r.total_gross),
          total_deductions: Number(r.total_deductions),
          total_net: Number(r.total_net),
        }))
      );
      setSlips(
        ((ps?.data ?? []) as unknown as RawSlip[]).map((r): SlipRow => {
          const e = first(r.employees);
          return {
            period: first(r.pay_periods)?.label ?? "-",
            emp_no: e?.employee_no ?? "-",
            emp_name: e ? `${e.first_name} ${e.last_name}` : "-",
            regular: Number(r.regular_hours),
            overtime: Number(r.overtime_hours),
            gross: Number(r.gross_pay),
            net: Number(r.net_pay),
          };
        })
      );
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, role, isPayrollSide]);

  // Default to the latest processed period (or the newest one)
  const defaultPeriod = useMemo(
    () => (periods.find((p) => p.status === "processed") ?? periods[0])?.label ?? "",
    [periods]
  );
  const period = periodChoice || defaultPeriod;
  const activeTab: Tab = tab ?? (isPayrollSide ? "payroll" : "absence");

  const summaryRows = summary.filter((r) => r.period === period);
  const absenceRows = absence
    .filter((r) => r.period === period)
    .sort((x, y) => y.days_absent - x.days_absent || y.days_late - x.days_late);
  const slipRows = slips
    .filter((r) => r.period === period)
    .sort((x, y) => y.overtime - x.overtime)
    .slice(0, 10);

  const tabs: { key: Tab; label: string }[] = [
    ...(isPayrollSide ? [{ key: "payroll" as Tab, label: "Payroll by department" }] : []),
    { key: "absence", label: "Absence and lateness" },
    ...(isPayrollSide ? [{ key: "overtime" as Tab, label: "Overtime leaders" }] : []),
  ];

  return (
    <AppShell title="Reports" subtitle="Management reports for a chosen pay period.">
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}

      <div className="toolbar">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {tabs.map((t) => (
            <button
              key={t.key}
              className={`btn small ${activeTab === t.key ? "" : "outline"}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <label style={{ ...filterLabel, marginLeft: "auto" }}>
          Pay period
          <select className="select" value={period} onChange={(e) => setPeriodChoice(e.target.value)}>
            {periods.map((p) => (
              <option key={p.id} value={p.label}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="card table-wrap">
        {!loaded ? (
          <p className="empty">Loading report...</p>
        ) : activeTab === "payroll" ? (
          summaryRows.length === 0 ? (
            <p className="empty">No payroll has been run for this period.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Department</th>
                  <th>Employees paid</th>
                  <th>Gross</th>
                  <th>Deductions</th>
                  <th>Net pay</th>
                </tr>
              </thead>
              <tbody>
                {summaryRows.map((r) => (
                  <tr key={r.department}>
                    <td className="cell-main">{r.department}</td>
                    <td>{r.employees_paid}</td>
                    <td>{money.format(r.total_gross)}</td>
                    <td>{money.format(r.total_deductions)}</td>
                    <td>{money.format(r.total_net)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td style={footCell}>Total</td>
                  <td style={footCell}>{summaryRows.reduce((t, r) => t + r.employees_paid, 0)}</td>
                  <td style={footCell}>{money.format(summaryRows.reduce((t, r) => t + r.total_gross, 0))}</td>
                  <td style={footCell}>{money.format(summaryRows.reduce((t, r) => t + r.total_deductions, 0))}</td>
                  <td style={footCell}>{money.format(summaryRows.reduce((t, r) => t + r.total_net, 0))}</td>
                </tr>
              </tfoot>
            </table>
          )
        ) : activeTab === "absence" ? (
          absenceRows.length === 0 ? (
            <p className="empty">No attendance recorded for this period.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Days absent</th>
                  <th>Days late</th>
                </tr>
              </thead>
              <tbody>
                {absenceRows.map((r) => (
                  <tr key={r.employee_no}>
                    <td>
                      <p className="cell-main">{r.employee}</p>
                      <p className="cell-sub">{r.employee_no}</p>
                    </td>
                    <td>
                      <span className={`badge ${r.days_absent > 0 ? "danger" : ""}`}>{r.days_absent}</span>
                    </td>
                    <td>
                      <span className={`badge ${r.days_late > 0 ? "warn" : ""}`}>{r.days_late}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : slipRows.length === 0 ? (
          <p className="empty">No payslips for this period.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Regular h</th>
                <th>Overtime h</th>
                <th>Gross</th>
                <th>Net pay</th>
              </tr>
            </thead>
            <tbody>
              {slipRows.map((r) => (
                <tr key={r.emp_no}>
                  <td>
                    <p className="cell-main">{r.emp_name}</p>
                    <p className="cell-sub">{r.emp_no}</p>
                  </td>
                  <td>{r.regular.toFixed(2)}</td>
                  <td>{r.overtime.toFixed(2)}</td>
                  <td>{money.format(r.gross)}</td>
                  <td>{money.format(r.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AppShell>
  );
}