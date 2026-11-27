"use client";

import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/AuthProvider";
import { Modal, Notices, filterLabel, first, money } from "@/components/pay/shared";

type Emp = { employee_no: string; first_name: string; last_name: string };
type TypeRow = { id: number; name: string; taxable: boolean };
type RawAssign = {
  employee_id: number;
  allowance_type_id: number;
  amount: number;
  employees: Emp | Emp[] | null;
  allowance_types: { name: string } | { name: string }[] | null;
};
type Assign = {
  employee_id: number;
  type_id: number;
  amount: number;
  emp_no: string;
  emp_name: string;
  type_name: string;
};
type Opt = { id: number; label: string };

function friendly(m: string): string {
  if (m.includes("allowance_types_name_key")) return "An allowance type with that name already exists.";
  if (m.includes("employee_allowances_pkey") || m.includes("duplicate key"))
    return "This employee already has that allowance. Edit the existing assignment instead.";
  if (m.includes("foreign key")) return "This allowance is still assigned to employees. Remove those assignments first.";
  if (m.includes("check constraint")) return "The amount cannot be negative.";
  if (m.includes("row-level security")) return "You do not have permission to do that.";
  return m;
}

export default function AllowancesTab() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [types, setTypes] = useState<TypeRow[]>([]);
  const [assigns, setAssigns] = useState<Assign[]>([]);
  const [emps, setEmps] = useState<Opt[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [typeName, setTypeName] = useState("");
  const [typeTaxable, setTypeTaxable] = useState(true);
  const [editing, setEditing] = useState<Assign | "new" | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      const [t, a, e] = await Promise.all([
        supabase.from("allowance_types").select("id, name, taxable").order("name"),
        supabase
          .from("employee_allowances")
          .select("employee_id, allowance_type_id, amount, employees(employee_no, first_name, last_name), allowance_types(name)")
          .order("employee_id"),
        supabase.from("employees").select("id, employee_no, first_name, last_name").order("employee_no"),
      ]);
      if (cancelled) return;
      if (t.error || a.error) {
        setError((t.error ?? a.error)!.message);
        setLoaded(true);
        return;
      }
      setTypes((t.data ?? []) as unknown as TypeRow[]);
      setAssigns(
        (a.data as unknown as RawAssign[]).map((x): Assign => {
          const emp = first(x.employees);
          return {
            employee_id: x.employee_id,
            type_id: x.allowance_type_id,
            amount: Number(x.amount),
            emp_no: emp?.employee_no ?? "-",
            emp_name: emp ? `${emp.first_name} ${emp.last_name}` : "-",
            type_name: first(x.allowance_types)?.name ?? "-",
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

  async function addType(e: FormEvent) {
    e.preventDefault();
    setNotice(null);
    const { error: err } = await supabase.from("allowance_types").insert({ name: typeName.trim(), taxable: typeTaxable });
    if (err) {
      setError(friendly(err.message));
      return;
    }
    setTypeName("");
    setError(null);
    setNotice("Allowance type added.");
    setReload((n) => n + 1);
  }

  async function removeType(t: TypeRow) {
    if (!window.confirm(`Delete the allowance type "${t.name}"?`)) return;
    setNotice(null);
    const { data, error: err } = await supabase.from("allowance_types").delete().eq("id", t.id).select("id");
    if (err) {
      setError(friendly(err.message));
      return;
    }
    if (!data || data.length === 0) {
      setError("You do not have permission to delete this type.");
      return;
    }
    setError(null);
    setNotice("Allowance type deleted.");
    setReload((n) => n + 1);
  }

  async function removeAssign(a: Assign) {
    if (!window.confirm(`Remove ${a.type_name} from ${a.emp_name}?`)) return;
    setNotice(null);
    const { data, error: err } = await supabase
      .from("employee_allowances")
      .delete()
      .eq("employee_id", a.employee_id)
      .eq("allowance_type_id", a.type_id)
      .select("employee_id");
    if (err) {
      setError(friendly(err.message));
      return;
    }
    if (!data || data.length === 0) {
      setError("You do not have permission to remove this allowance.");
      return;
    }
    setError(null);
    setNotice("Allowance removed.");
    setReload((n) => n + 1);
  }

  return (
    <>
      <Notices notice={notice} error={error} />

      <section className="section">
        <h2 className="section-title">Allowance types</h2>
        <form className="card toolbar" onSubmit={addType} style={{ marginBottom: 12 }}>
          <label style={{ ...filterLabel, flex: 1, minWidth: 200 }}>
            Name
            <input className="input" required value={typeName} onChange={(e) => setTypeName(e.target.value)} />
          </label>
          <label style={{ display: "flex", gap: 8, alignItems: "center", alignSelf: "end", padding: "11px 0" }}>
            <input type="checkbox" checked={typeTaxable} onChange={(e) => setTypeTaxable(e.target.checked)} />
            Taxable
          </label>
          <button className="btn" type="submit" style={{ alignSelf: "end" }}>
            Add type
          </button>
        </form>

        <div className="card table-wrap">
          {!loaded ? (
            <p className="empty">Loading...</p>
          ) : types.length === 0 ? (
            <p className="empty">No allowance types yet.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Taxable</th>
                  <th>Assigned to</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {types.map((t) => {
                  const used = assigns.filter((a) => a.type_id === t.id).length;
                  return (
                    <tr key={t.id}>
                      <td className="cell-main">{t.name}</td>
                      <td>{t.taxable ? "Yes" : "No"}</td>
                      <td>{used} employees</td>
                      <td>
                        <div className="actions">
                          <button className="btn small danger" disabled={used > 0} onClick={() => removeType(t)}>
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
      </section>

      <section className="section">
        <div className="toolbar">
          <h2 className="section-title" style={{ margin: 0 }}>
            Assignments
          </h2>
          <button
            className="btn"
            style={{ marginLeft: "auto" }}
            disabled={types.length === 0}
            onClick={() => setEditing("new")}
          >
            Assign allowance
          </button>
        </div>

        <div className="card table-wrap">
          {!loaded ? (
            <p className="empty">Loading...</p>
          ) : assigns.length === 0 ? (
            <p className="empty">No allowances assigned yet.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Allowance</th>
                  <th>Amount per period</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {assigns.map((a) => (
                  <tr key={`${a.employee_id}-${a.type_id}`}>
                    <td>
                      <p className="cell-main">{a.emp_name}</p>
                      <p className="cell-sub">{a.emp_no}</p>
                    </td>
                    <td>{a.type_name}</td>
                    <td>{money.format(a.amount)}</td>
                    <td>
                      <div className="actions">
                        <button className="btn small outline" onClick={() => setEditing(a)}>
                          Edit
                        </button>
                        <button className="btn small danger" onClick={() => removeAssign(a)}>
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {editing && (
        <AssignForm
          initial={editing === "new" ? null : editing}
          emps={emps}
          types={types}
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

function AssignForm({
  initial,
  emps,
  types,
  onClose,
  onSaved,
}: {
  initial: Assign | null;
  emps: Opt[];
  types: TypeRow[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [employeeId, setEmployeeId] = useState(String(initial?.employee_id ?? emps[0]?.id ?? ""));
  const [typeId, setTypeId] = useState(String(initial?.type_id ?? types[0]?.id ?? ""));
  const [amount, setAmount] = useState(String(initial?.amount ?? ""));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    if (initial) {
      const { data, error: err } = await supabase
        .from("employee_allowances")
        .update({ amount: Number(amount) })
        .eq("employee_id", initial.employee_id)
        .eq("allowance_type_id", initial.type_id)
        .select("employee_id");
      if (err || !data || data.length === 0) {
        setError(err ? friendly(err.message) : "You do not have permission to change this allowance.");
        setSaving(false);
        return;
      }
      onSaved("Allowance updated.");
    } else {
      const { error: err } = await supabase.from("employee_allowances").insert({
        employee_id: Number(employeeId),
        allowance_type_id: Number(typeId),
        amount: Number(amount),
      });
      if (err) {
        setError(friendly(err.message));
        setSaving(false);
        return;
      }
      onSaved("Allowance assigned.");
    }
  }

  return (
    <Modal title={initial ? "Edit allowance amount" : "Assign allowance"} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="form-grid">
          <div className="field full">
            <label htmlFor="al-emp">Employee</label>
            <select
              id="al-emp"
              className="select"
              disabled={!!initial}
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
            <label htmlFor="al-type">Allowance</label>
            <select
              id="al-type"
              className="select"
              disabled={!!initial}
              value={typeId}
              onChange={(e) => setTypeId(e.target.value)}
            >
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="al-amt">Amount per period (USD)</label>
            <input
              id="al-amt"
              className="input"
              type="number"
              step="0.01"
              min="0"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
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
            {saving ? "Saving..." : initial ? "Save changes" : "Assign allowance"}
          </button>
        </div>
      </form>
    </Modal>
  );
}