"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/AuthProvider";
import AppShell from "@/components/AppShell";
import { Icon, type IconName } from "@/components/Icon";
import { NAV } from "@/lib/nav";

type Counts = { employees: number | null; attendance: number | null; payslips: number | null };

export default function DashboardPage() {
  const { user, role, fullName } = useAuth();
  const [counts, setCounts] = useState<Counts | null>(null);
  const userId = user?.id ?? null;

  // These totals differ by role because Row Level Security filters the rows.
  useEffect(() => {
    if (!userId || !role) return;
    let cancelled = false;
    (async () => {
      const count = (table: string) =>
        supabase.from(table).select("*", { count: "exact", head: true });
      const [e, a, p] = await Promise.all([count("employees"), count("attendance"), count("payslips")]);
      if (!cancelled) setCounts({ employees: e.count, attendance: a.count, payslips: p.count });
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, role]);

  const firstName = fullName?.split(" ")[0] ?? user?.email?.split("@")[0] ?? "there";

  const stats: { label: string; value: number | null; icon: IconName }[] = [
    { label: "Employee records", value: counts?.employees ?? null, icon: "users" },
    { label: "Attendance records", value: counts?.attendance ?? null, icon: "clock" },
    { label: "Payslips", value: counts?.payslips ?? null, icon: "receipt" },
  ];

  return (
    <AppShell title={`Welcome back, ${firstName}`} subtitle="Here is what your role can see today.">
      <section className="section">
        <h2 className="section-title">Overview</h2>
        <div className="stat-grid">
          {stats.map((s) => (
            <div key={s.label} className="card stat">
              <span className="stat-icon">
                <Icon name={s.icon} size={22} />
              </span>
              <div>
                <p className="stat-label">{s.label}</p>
                <p className="stat-value">
                  {s.value === null ? <span className="skeleton" /> : s.value}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="callout">
          <Icon name="info" size={18} />
          <p>
            These totals come straight from the database and are filtered by your role using Row
            Level Security. Sign in as a different role to compare.
          </p>
        </div>
      </section>

      {role && (
        <section className="section">
          <h2 className="section-title">Your modules</h2>
          <div className="module-grid">
            {NAV[role].map((m) => {
              const body = (
                <>
                  <div className="module-top">
                    <span className="module-icon">
                      <Icon name={m.icon} />
                    </span>
                    <span className={`badge ${m.ready ? "ready" : ""}`}>
                      {m.ready ? "Open" : "Coming soon"}
                    </span>
                  </div>
                  <p className="module-name">{m.label}</p>
                  <p className="module-note">{m.note}</p>
                </>
              );
              return m.ready ? (
                <Link key={m.href} href={m.href} className="card module">
                  {body}
                </Link>
              ) : (
                <div key={m.href} className="card module">
                  {body}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </AppShell>
  );
}