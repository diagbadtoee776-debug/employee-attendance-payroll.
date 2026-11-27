"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/AuthProvider";
import AppShell from "@/components/AppShell";

type Json = Record<string, unknown>;

type Entry = {
  id: number;
  table_name: string;
  record_id: string | null;
  action: "INSERT" | "UPDATE" | "DELETE";
  old_data: Json | null;
  new_data: Json | null;
  changed_by: string | null;
  changed_at: string;
};

const ACTION_CLASS: Record<Entry["action"], string> = { INSERT: "success", UPDATE: "warn", DELETE: "danger" };
const filterLabel: CSSProperties = { display: "grid", gap: 4, fontSize: 12, color: "var(--muted)" };
const IGNORE = new Set(["created_at", "generated_at"]);

const show = (v: unknown) => (v === null || v === undefined ? "empty" : String(v));

// A short plain-language summary of what changed
function describe(e: Entry): string {
  if (e.action === "UPDATE" && e.old_data && e.new_data) {
    const changes = Object.keys(e.new_data)
      .filter((k) => !IGNORE.has(k) && JSON.stringify(e.new_data![k]) !== JSON.stringify(e.old_data![k]))
      .map((k) => `${k}: ${show(e.old_data![k])} → ${show(e.new_data![k])}`);
    if (changes.length === 0) return "No visible change";
    return changes.slice(0, 3).join("; ") + (changes.length > 3 ? "; ..." : "");
  }
  const d = e.new_data ?? e.old_data ?? {};
  const verb = e.action === "INSERT" ? "Added" : "Removed";
  if (e.table_name === "employees") return `${verb} ${show(d.first_name)} ${show(d.last_name)} (${show(d.employee_no)})`;
  if (e.table_name === "pay_rates") return `${verb} rate ${show(d.hourly_rate)} per hour from ${show(d.effective_from)}`;
  if (e.table_name === "payslips") return `${verb} payslip, net pay ${show(d.net_pay)}`;
  return `${verb} a row`;
}

export default function AuditLogPage() {
  const { user, role } = useAuth();
  const userId = user?.id ?? null;
  const isAdmin = role === "admin";

  const [entries, setEntries] = useState<Entry[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tableFilter, setTableFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");

  useEffect(() => {
    if (!userId || !isAdmin) return;
    let cancelled = false;
    (async () => {
      const [a, e] = await Promise.all([
        supabase.from("audit_log").select("*").order("changed_at", { ascending: false }).limit(200),
        supabase.from("employees").select("user_id, first_name, last_name").not("user_id", "is", null),
      ]);
      if (cancelled) return;
      if (a.error) {
        setError(a.error.message);
        setLoaded(true);
        return;
      }
      const map = new Map<string, string>();
      ((e.data ?? []) as unknown as { user_id: string; first_name: string; last_name: string }[]).forEach((r) =>
        map.set(r.user_id, `${r.first_name} ${r.last_name}`)
      );
      setNames(map);
      setEntries((a.data ?? []) as unknown as Entry[]);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, isAdmin]);

  const tables = useMemo(() => Array.from(new Set(entries.map((e) => e.table_name))).sort(), [entries]);
  const filtered = entries.filter(
    (e) => (tableFilter === "all" || e.table_name === tableFilter) && (actionFilter === "all" || e.action === actionFilter)
  );

  const who = (id: string | null) => (id ? (names.get(id) ?? `User ${id.slice(0, 8)}`) : "System (SQL)");

  return (
    <AppShell title="Audit log" subtitle="Changes to employees, pay rates and payslips, recorded automatically by database triggers.">
      {role && !isAdmin ? (
        <p className="alert" role="alert">
          Only administrators can view the audit log.
        </p>
      ) : (
        <>
          {error && (
            <p className="alert" role="alert">
              {error}
            </p>
          )}

          <div className="toolbar">
            <label style={filterLabel}>
              Table
              <select className="select" value={tableFilter} onChange={(e) => setTableFilter(e.target.value)}>
                <option value="all">All tables</option>
                {tables.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label style={filterLabel}>
              Action
              <select className="select" value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
                <option value="all">All actions</option>
                <option value="INSERT">Insert</option>
                <option value="UPDATE">Update</option>
                <option value="DELETE">Delete</option>
              </select>
            </label>
          </div>

          <div className="card table-wrap">
            {!loaded ? (
              <p className="empty">Loading audit log...</p>
            ) : filtered.length === 0 ? (
              <p className="empty">No entries match.</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>When (UTC)</th>
                    <th>Table</th>
                    <th>Action</th>
                    <th>What changed</th>
                    <th>By</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((e) => (
                    <tr key={e.id}>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {e.changed_at.slice(0, 10)} {e.changed_at.slice(11, 16)}
                      </td>
                      <td>
                        <p className="cell-main">{e.table_name}</p>
                        <p className="cell-sub">id {e.record_id ?? "-"}</p>
                      </td>
                      <td>
                        <span className={`badge ${ACTION_CLASS[e.action]}`}>{e.action}</span>
                      </td>
                      <td className="cell-sub">{describe(e)}</td>
                      <td>{who(e.changed_by)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </AppShell>
  );
}