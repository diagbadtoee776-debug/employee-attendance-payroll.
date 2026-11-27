"use client";

import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/AuthProvider";
import AppShell from "@/components/AppShell";

type AStatus = "present" | "late" | "absent" | "leave";
type Emp = { employee_no: string; first_name: string; last_name: string };

type RawAttendance = {
  id: number;
  employee_id: number;
  work_date: string;
  clock_in: string | null;
  clock_out: string | null;
  status: AStatus;
  note: string | null;
  employees: Emp | Emp[] | null;
};

type Row = {
  id: number;
  employee_id: number;
  work_date: string;
  clock_in: string | null;
  clock_out: string | null;
  status: AStatus;
  note: string | null;
  emp_no: string;
  emp_name: string;
};

type EmpOption = { id: number; label: string };

const STATUS_LABEL: Record<AStatus, string> = {
  present: "Present",
  late: "Late",
  absent: "Absent",
  leave: "On leave",
};
const STATUS_CLASS: Record<AStatus, string> = {
  present: "success",
  late: "warn",
  absent: "danger",
  leave: "",
};

const filterLabel: CSSProperties = { display: "grid", gap: 4, fontSize: 12, color: "var(--muted)" };

function first<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

// Timestamps come back in UTC (same as Liberia time), so HH:MM is characters 11-16
const hhmm = (ts: string | null) => (ts ? ts.slice(11, 16) : "-");

function hours(row: Row): string {
  if (!row.clock_in || !row.clock_out) return "-";
  const h = (new Date(row.clock_out).getTime() - new Date(row.clock_in).getTime()) / 3600000;
  return h.toFixed(2);
}

// Turn database rule errors into plain language
function friendly(message: string): string {
  if (message.includes("future date")) return "Attendance cannot be recorded for a future date.";
  if (message.includes("terminated employee")) return "Cannot record attendance for a terminated employee.";
  if (message.includes("must match work_date")) return "The clock-in time must fall on the attendance date.";
  if (message.includes("attendance_employee_id_work_date_key") || message.includes("duplicate key"))
    return "This employee already has a record for that day. Edit the existing record instead.";
  if (message.includes("check constraint"))
    return "Check the times: clock-out must be after clock-in, and Present or Late needs a clock-in time.";
  if (message.includes("row-level security")) return "You do not have permission to do that.";
  return message;
}

export default function AttendancePage() {
  const { user, role } = useAuth();
  const userId = user?.id ?? null;
  const canEdit = role === "admin" || role === "hr";

  const [rows, setRows] = useState<Row[]>([]);
  const [employees, setEmployees] = useState<EmpOption[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const [from, setFrom] = useState(isoDaysAgo(30));
  const [to, setTo] = useState(isoDaysAgo(0));
  const [empFilter, setEmpFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | AStatus>("all");
  const [editing, setEditing] = useState<Row | "new" | null>(null);

  // Employee list for the filter and the form
  useEffect(() => {
    if (!userId) return;
    (async () => {
      const { data } = await supabase
        .from("employees")
        .select("id, employee_no, first_name, last_name, status")
        .order("employee_no");
      const list = (data ?? []) as unknown as {
        id: number;
        employee_no: string;
        first_name: string;
        last_name: string;
        status: string;
      }[];
      setEmployees(
        list.map((e) => ({
          id: e.id,
          label: `${e.employee_no} · ${e.first_name} ${e.last_name}${e.status === "terminated" ? " (terminated)" : ""}`,
        }))
      );
    })();
  }, [userId]);

  // Attendance rows for the chosen filters
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      let q = supabase
        .from("attendance")
        .select(
          "id, employee_id, work_date, clock_in, clock_out, status, note, employees(employee_no, first_name, last_name)"
        )
        .gte("work_date", from)
        .lte("work_date", to)
        .order("work_date", { ascending: false })
        .order("employee_id")
        .limit(500);
      if (empFilter !== "all") q = q.eq("employee_id", Number(empFilter));
      if (statusFilter !== "all") q = q.eq("status", statusFilter);

      const { data, error: err } = await q;
      if (cancelled) return;
      if (err) {
        setError(err.message);
        setLoaded(true);
        return;
      }
      setRows(
        (data as unknown as RawAttendance[]).map((r): Row => {
          const e = first(r.employees);
          return {
            id: r.id,
            employee_id: r.employee_id,
            work_date: r.work_date,
            clock_in: r.clock_in,
            clock_out: r.clock_out,
            status: r.status,
            note: r.note,
            emp_no: e?.employee_no ?? "-",
            emp_name: e ? `${e.first_name} ${e.last_name}` : "-",
          };
        })
      );
      setError(null);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, from, to, empFilter, statusFilter, reload]);

  const summary = useMemo(() => {
    const s = { present: 0, late: 0, absent: 0, leave: 0 };
    rows.forEach((r) => {
      s[r.status] += 1;
    });
    return s;
  }, [rows]);

  async function remove(row: Row) {
    if (!window.confirm(`Delete the record for ${row.emp_name} on ${row.work_date}?`)) return;
    const { data, error: err } = await supabase.from("attendance").delete().eq("id", row.id).select("id");
    if (err) {
      setNotice(null);
      setError(friendly(err.message));
      return;
    }
    if (!data || data.length === 0) {
      setError("You do not have permission to delete this record.");
      return;
    }
    setError(null);
    setNotice("Attendance record deleted.");
    setReload((n) => n + 1);
  }

  return (
    <AppShell title="Attendance" subtitle="Daily attendance records. Times are in UTC, the same as Liberia.">
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

      <section className="section">
        <div className="stat-grid">
          {(["present", "late", "absent", "leave"] as AStatus[]).map((s) => (
            <div key={s} className="card">
              <p className="stat-label">{STATUS_LABEL[s]}</p>
              <p className="stat-value">{loaded ? summary[s] : <span className="skeleton" />}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="toolbar">
        <label style={filterLabel}>
          From
          <input className="input" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label style={filterLabel}>
          To
          <input className="input" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </label>
        <label style={filterLabel}>
          Employee
          <select className="select" value={empFilter} onChange={(e) => setEmpFilter(e.target.value)}>
            <option value="all">All employees</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </select>
        </label>
        <label style={filterLabel}>
          Status
          <select
            className="select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "all" | AStatus)}
          >
            <option value="all">All statuses</option>
            <option value="present">Present</option>
            <option value="late">Late</option>
            <option value="absent">Absent</option>
            <option value="leave">On leave</option>
          </select>
        </label>
        {canEdit && (
          <button className="btn" style={{ marginLeft: "auto", alignSelf: "end" }} onClick={() => setEditing("new")}>
            Record attendance
          </button>
        )}
      </div>

      <div className="card table-wrap">
        {!loaded ? (
          <p className="empty">Loading attendance...</p>
        ) : rows.length === 0 ? (
          <p className="empty">No attendance records in this range.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Employee</th>
                <th>Status</th>
                <th>In</th>
                <th>Out</th>
                <th>Hours</th>
                <th>Note</th>
                {canEdit && <th aria-label="Actions" />}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.work_date}</td>
                  <td>
                    <p className="cell-main">{r.emp_name}</p>
                    <p className="cell-sub">{r.emp_no}</p>
                  </td>
                  <td>
                    <span className={`badge ${STATUS_CLASS[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                  </td>
                  <td>{hhmm(r.clock_in)}</td>
                  <td>{hhmm(r.clock_out)}</td>
                  <td>{hours(r)}</td>
                  <td className="cell-sub">{r.note ?? ""}</td>
                  {canEdit && (
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
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editing && (
        <AttendanceForm
          initial={editing === "new" ? null : editing}
          employees={employees}
          onClose={() => setEditing(null)}
          onSaved={(message) => {
            setEditing(null);
            setError(null);
            setNotice(message);
            setReload((n) => n + 1);
          }}
        />
      )}
    </AppShell>
  );
}

type FormProps = {
  initial: Row | null;
  employees: EmpOption[];
  onClose: () => void;
  onSaved: (message: string) => void;
};

function AttendanceForm({ initial, employees, onClose, onSaved }: FormProps) {
  const today = new Date().toISOString().slice(0, 10);
  const [employeeId, setEmployeeId] = useState(String(initial?.employee_id ?? employees[0]?.id ?? ""));
  const [workDate, setWorkDate] = useState(initial?.work_date ?? isoDaysAgo(1));
  const [status, setStatus] = useState<AStatus>(initial?.status ?? "present");
  const [clockIn, setClockIn] = useState(initial?.clock_in ? hhmm(initial.clock_in) : "09:00");
  const [clockOut, setClockOut] = useState(initial?.clock_out ? hhmm(initial.clock_out) : "17:00");
  const [note, setNote] = useState(initial?.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const timed = status === "present" || status === "late";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const payload = {
      employee_id: Number(employeeId),
      work_date: workDate,
      status,
      clock_in: timed && clockIn ? `${workDate}T${clockIn}:00+00:00` : null,
      clock_out: timed && clockOut ? `${workDate}T${clockOut}:00+00:00` : null,
      note: note.trim() || null,
    };

    if (initial) {
      const { data, error: err } = await supabase
        .from("attendance")
        .update(payload)
        .eq("id", initial.id)
        .select("id");
      if (err || !data || data.length === 0) {
        setError(err ? friendly(err.message) : "You do not have permission to change this record.");
        setSaving(false);
        return;
      }
      onSaved("Attendance record updated.");
    } else {
      const { error: err } = await supabase.from("attendance").insert(payload);
      if (err) {
        setError(friendly(err.message));
        setSaving(false);
        return;
      }
      onSaved("Attendance recorded.");
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="att-form-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="att-form-title">{initial ? "Edit attendance" : "Record attendance"}</h2>

        <form onSubmit={submit}>
          <div className="form-grid">
            <div className="field full">
              <label htmlFor="a-emp">Employee</label>
              <select
                id="a-emp"
                className="select"
                required
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
              >
                {employees.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="a-date">Date</label>
              <input
                id="a-date"
                className="input"
                type="date"
                required
                value={workDate}
                onChange={(e) => setWorkDate(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="a-status">Status</label>
              <select
                id="a-status"
                className="select"
                value={status}
                onChange={(e) => setStatus(e.target.value as AStatus)}
              >
                <option value="present">Present</option>
                <option value="late">Late</option>
                <option value="absent">Absent</option>
                <option value="leave">On leave</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="a-in">Clock in</label>
              <input
                id="a-in"
                className="input"
                type="time"
                disabled={!timed}
                required={timed}
                value={clockIn}
                onChange={(e) => setClockIn(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="a-out">Clock out</label>
              <input
                id="a-out"
                className="input"
                type="time"
                disabled={!timed}
                value={clockOut}
                onChange={(e) => setClockOut(e.target.value)}
              />
            </div>
            <div className="field full">
              <label htmlFor="a-note">Note (optional)</label>
              <input id="a-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>

          <p className="cell-sub" style={{ marginBottom: 12 }}>
            Dates after {today} are rejected by the database.
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
              {saving ? "Saving..." : initial ? "Save changes" : "Record attendance"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}