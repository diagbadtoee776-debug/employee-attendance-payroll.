"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/AuthProvider";
import AppShell from "@/components/AppShell";

type Status = "active" | "on_leave" | "terminated";
type Named = { name: string };
type PosRaw = { title: string; departments: Named | Named[] | null };

type RawEmployee = {
  id: number;
  employee_no: string;
  first_name: string;
  last_name: string;
  email: string;
  status: Status;
  hire_date: string;
  position_id: number;
  shift_id: number;
  positions: PosRaw | PosRaw[] | null;
  shifts: Named | Named[] | null;
};

type Row = {
  id: number;
  employee_no: string;
  first_name: string;
  last_name: string;
  email: string;
  status: Status;
  hire_date: string;
  position_id: number;
  shift_id: number;
  department: string;
  position: string;
  shift: string;
};

type Option = { id: number; label: string };

const STATUS_LABEL: Record<Status, string> = {
  active: "Active",
  on_leave: "On leave",
  terminated: "Terminated",
};
const STATUS_CLASS: Record<Status, string> = {
  active: "success",
  on_leave: "warn",
  terminated: "danger",
};

function first<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

// Turn database rule errors into plain language
function friendly(message: string): string {
  if (message.includes("employees_email_key")) return "That email is already used by another employee.";
  if (message.includes("employees_employee_no_key")) return "That employee number already exists.";
  if (message.includes("employee_no_check")) return "Employee number must look like EMP0001.";
  if (message.includes("hire_date_check")) return "Hire date cannot be in the future.";
  if (message.includes("email_check")) return "Please enter a valid email address.";
  if (message.includes("row-level security")) return "You do not have permission to do that.";
  return message;
}

export default function EmployeesPage() {
  const { user, role } = useAuth();
  const userId = user?.id ?? null;
  const canEdit = role === "admin" || role === "hr";

  const [rows, setRows] = useState<Row[]>([]);
  const [positions, setPositions] = useState<Option[]>([]);
  const [shifts, setShifts] = useState<Option[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | Status>("all");
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [emp, pos, sh] = await Promise.all([
      supabase
        .from("employees")
        .select(
          "id, employee_no, first_name, last_name, email, status, hire_date, position_id, shift_id, positions(title, departments(name)), shifts(name)"
        )
        .order("employee_no"),
      supabase.from("positions").select("id, title, departments(name)").order("title"),
      supabase.from("shifts").select("id, name, start_time, end_time").order("id"),
    ]);

    if (emp.error) {
      setLoadError(emp.error.message);
      setLoaded(true);
      return;
    }

    const mapped = (emp.data as unknown as RawEmployee[]).map((r): Row => {
      const p = first(r.positions);
      return {
        id: r.id,
        employee_no: r.employee_no,
        first_name: r.first_name,
        last_name: r.last_name,
        email: r.email,
        status: r.status,
        hire_date: r.hire_date,
        position_id: r.position_id,
        shift_id: r.shift_id,
        department: first(p?.departments)?.name ?? "-",
        position: p?.title ?? "-",
        shift: first(r.shifts)?.name ?? "-",
      };
    });

    const posOptions = ((pos.data ?? []) as unknown as { id: number; title: string; departments: Named | Named[] | null }[]).map(
      (p) => ({ id: p.id, label: `${p.title} (${first(p.departments)?.name ?? "-"})` })
    );
    const shiftOptions = ((sh.data ?? []) as unknown as { id: number; name: string; start_time: string; end_time: string }[]).map(
      (s) => ({ id: s.id, label: `${s.name} (${s.start_time.slice(0, 5)} to ${s.end_time.slice(0, 5)})` })
    );

    setRows(mapped);
    setPositions(posOptions);
    setShifts(shiftOptions);
    setLoadError(null);
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      await load();
    })();
  }, [userId, load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!q) return true;
      return (
        r.employee_no.toLowerCase().includes(q) ||
        `${r.first_name} ${r.last_name}`.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        r.department.toLowerCase().includes(q) ||
        r.position.toLowerCase().includes(q)
      );
    });
  }, [rows, query, statusFilter]);

  const nextNo = useMemo(() => {
    const max = rows.reduce((m, r) => Math.max(m, Number(r.employee_no.replace(/\D/g, "")) || 0), 0);
    return `EMP${String(max + 1).padStart(4, "0")}`;
  }, [rows]);

  async function changeStatus(row: Row, status: Status) {
    const name = `${row.first_name} ${row.last_name}`;
    if (
      status === "terminated" &&
      !window.confirm(
        `Deactivate ${name}? They will be left out of payroll and cannot receive new attendance records.`
      )
    ) {
      return;
    }
    const { data, error } = await supabase.from("employees").update({ status }).eq("id", row.id).select("id");
    if (error) {
      setNotice(null);
      setLoadError(friendly(error.message));
      return;
    }
    if (!data || data.length === 0) {
      setLoadError("You do not have permission to change this employee.");
      return;
    }
    setLoadError(null);
    setNotice(status === "terminated" ? `${name} was deactivated.` : `${name} was reactivated.`);
    await load();
  }

  return (
    <AppShell title="Employees" subtitle="Staff records, positions and shifts.">
      {notice && (
        <p className="notice-ok" role="status">
          {notice}
        </p>
      )}
      {loadError && (
        <p className="alert" role="alert">
          {loadError}
        </p>
      )}

      <div className="toolbar">
        <input
          className="input grow"
          type="search"
          placeholder="Search by name, number, email, department..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search employees"
        />
        <select
          className="select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as "all" | Status)}
          aria-label="Filter by status"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="on_leave">On leave</option>
          <option value="terminated">Terminated</option>
        </select>
        {canEdit && (
          <button className="btn" onClick={() => setEditing("new")}>
            Add employee
          </button>
        )}
      </div>

      <div className="card table-wrap">
        {!loaded ? (
          <p className="empty">Loading employees...</p>
        ) : filtered.length === 0 ? (
          <p className="empty">No employees match your search.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Department</th>
                <th>Position</th>
                <th>Shift</th>
                <th>Hired</th>
                <th>Status</th>
                {canEdit && <th aria-label="Actions" />}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td>
                    <p className="cell-main">
                      {r.first_name} {r.last_name}
                    </p>
                    <p className="cell-sub">
                      {r.employee_no} · {r.email}
                    </p>
                  </td>
                  <td>{r.department}</td>
                  <td>{r.position}</td>
                  <td>{r.shift}</td>
                  <td>{r.hire_date}</td>
                  <td>
                    <span className={`badge ${STATUS_CLASS[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                  </td>
                  {canEdit && (
                    <td>
                      <div className="actions">
                        <button className="btn small outline" onClick={() => setEditing(r)}>
                          Edit
                        </button>
                        {r.status === "terminated" ? (
                          <button className="btn small outline" onClick={() => changeStatus(r, "active")}>
                            Reactivate
                          </button>
                        ) : (
                          <button className="btn small danger" onClick={() => changeStatus(r, "terminated")}>
                            Deactivate
                          </button>
                        )}
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
        <EmployeeForm
          initial={editing === "new" ? null : editing}
          suggestedNo={nextNo}
          positions={positions}
          shifts={shifts}
          onClose={() => setEditing(null)}
          onSaved={async (message) => {
            setEditing(null);
            setLoadError(null);
            setNotice(message);
            await load();
          }}
        />
      )}
    </AppShell>
  );
}

type FormProps = {
  initial: Row | null;
  suggestedNo: string;
  positions: Option[];
  shifts: Option[];
  onClose: () => void;
  onSaved: (message: string) => void | Promise<void>;
};

function EmployeeForm({ initial, suggestedNo, positions, shifts, onClose, onSaved }: FormProps) {
  const today = new Date().toISOString().slice(0, 10);
  const [employeeNo, setEmployeeNo] = useState(initial?.employee_no ?? suggestedNo);
  const [firstName, setFirstName] = useState(initial?.first_name ?? "");
  const [lastName, setLastName] = useState(initial?.last_name ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [positionId, setPositionId] = useState(String(initial?.position_id ?? positions[0]?.id ?? ""));
  const [shiftId, setShiftId] = useState(String(initial?.shift_id ?? shifts[0]?.id ?? ""));
  const [hireDate, setHireDate] = useState(initial?.hire_date ?? today);
  const [status, setStatus] = useState<Status>(initial?.status ?? "active");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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
      employee_no: employeeNo.trim().toUpperCase(),
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      email: email.trim().toLowerCase(),
      position_id: Number(positionId),
      shift_id: Number(shiftId),
      hire_date: hireDate,
      status,
    };

    if (initial) {
      const { data, error } = await supabase
        .from("employees")
        .update(payload)
        .eq("id", initial.id)
        .select("id");
      if (error || !data || data.length === 0) {
        setError(error ? friendly(error.message) : "You do not have permission to change this employee.");
        setSaving(false);
        return;
      }
      await onSaved("Employee updated.");
    } else {
      const { error } = await supabase.from("employees").insert(payload);
      if (error) {
        setError(friendly(error.message));
        setSaving(false);
        return;
      }
      await onSaved("Employee added.");
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="emp-form-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="emp-form-title">{initial ? "Edit employee" : "Add employee"}</h2>

        <form onSubmit={submit}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="f-no">Employee number</label>
              <input
                id="f-no"
                className="input"
                required
                pattern="EMP[0-9]{4}"
                title="Format: EMP followed by 4 digits, for example EMP0011"
                value={employeeNo}
                onChange={(e) => setEmployeeNo(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="f-hire">Hire date</label>
              <input
                id="f-hire"
                className="input"
                type="date"
                required
                max={today}
                value={hireDate}
                onChange={(e) => setHireDate(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="f-first">First name</label>
              <input
                id="f-first"
                className="input"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="f-last">Last name</label>
              <input
                id="f-last"
                className="input"
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>
            <div className="field full">
              <label htmlFor="f-email">Email</label>
              <input
                id="f-email"
                className="input"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="f-pos">Position</label>
              <select
                id="f-pos"
                className="select"
                required
                value={positionId}
                onChange={(e) => setPositionId(e.target.value)}
              >
                {positions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="f-shift">Shift</label>
              <select
                id="f-shift"
                className="select"
                required
                value={shiftId}
                onChange={(e) => setShiftId(e.target.value)}
              >
                {shifts.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field full">
              <label htmlFor="f-status">Status</label>
              <select
                id="f-status"
                className="select"
                value={status}
                onChange={(e) => setStatus(e.target.value as Status)}
              >
                <option value="active">Active</option>
                <option value="on_leave">On leave</option>
                <option value="terminated">Terminated</option>
              </select>
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
              {saving ? "Saving..." : initial ? "Save changes" : "Add employee"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}