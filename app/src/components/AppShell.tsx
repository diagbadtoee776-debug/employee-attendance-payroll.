"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/components/AuthProvider";
import { Icon } from "@/components/Icon";
import { NAV, ROLE_LABEL } from "@/lib/nav";

function initials(name: string) {
  const parts = name.trim().split(/[\s._@-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

type Props = { title: string; subtitle?: string; children: ReactNode };

// Wraps every signed-in page: login guard, sidebar, user card, page heading.
export default function AppShell({ title, subtitle, children }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, role, fullName, loading, signOut } = useAuth();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading || !user) return <div className="splash">Loading...</div>;

  if (!role) {
    return (
      <div className="splash">
        <div className="notice">
          <p>Your login has no role yet. Ask an administrator to assign one.</p>
          <button className="btn ghost" onClick={signOut}>
            Sign out
          </button>
        </div>
      </div>
    );
  }

  const display = fullName ?? user.email ?? "User";
  const items = NAV[role];

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <Icon name="wallet" />
          </span>
          <div>
            <p className="brand-name">Payroll</p>
            <p className="brand-sub">Attendance &amp; Payroll</p>
          </div>
        </div>

        <nav className="nav" aria-label="Main">
          <Link href="/dashboard" className={`nav-item ${pathname === "/dashboard" ? "active" : ""}`}>
            <Icon name="dashboard" />
            Dashboard
          </Link>
          <p className="nav-label">Modules</p>
          {items.map((item) =>
            item.ready ? (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-item ${pathname.startsWith(item.href) ? "active" : ""}`}
              >
                <Icon name={item.icon} />
                {item.label}
              </Link>
            ) : (
              <span key={item.href} className="nav-item soon" aria-disabled="true">
                <Icon name={item.icon} />
                {item.label}
                <span className="soon-tag">Soon</span>
              </span>
            )
          )}
        </nav>

        <div className="user-card">
          <span className="avatar">{initials(display)}</span>
          <div className="user-meta">
            <p className="user-name">{display}</p>
            <span className="role-pill">{ROLE_LABEL[role]}</span>
          </div>
          <button className="icon-btn" onClick={signOut} aria-label="Sign out" title="Sign out">
            <Icon name="logout" size={18} />
          </button>
        </div>
      </aside>

      <main className="main">
        <div className="content">
          <header className="page-head">
            <h1>{title}</h1>
            {subtitle && <p>{subtitle}</p>}
          </header>
          {children}
        </div>
      </main>
    </div>
  );
}