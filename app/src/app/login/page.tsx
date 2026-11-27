"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/AuthProvider";
import { Icon } from "@/components/Icon";

export default function LoginPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Already signed in? Go straight to the dashboard.
  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [loading, user, router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <section className="auth-brand">
        <div className="brand">
          <span className="brand-mark">
            <Icon name="wallet" />
          </span>
          <div>
            <p className="brand-name">Payroll</p>
            <p className="brand-sub">Attendance &amp; Payroll System</p>
          </div>
        </div>

        <div>
          <h1 className="auth-headline">Attendance and payroll, handled with care.</h1>
          <ul className="auth-points">
            <li>
              <Icon name="clock" />
              Daily attendance validated by the database itself
            </li>
            <li>
              <Icon name="play" />
              Payroll runs are all-or-nothing, never half done
            </li>
            <li>
              <Icon name="shield" />
              Role-based access: people see only what they should
            </li>
          </ul>
        </div>

        <p className="auth-foot">CSENG 407 · William V. S. Tubman University</p>
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          <div className="brand brand-inline">
            <span className="brand-mark">
              <Icon name="wallet" />
            </span>
            <div>
              <p className="brand-name">Payroll</p>
              <p className="brand-sub">Attendance &amp; Payroll</p>
            </div>
          </div>

          <h2>Welcome back</h2>
          <p className="lead">Sign in to continue</p>

          <form onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                className="input"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="password">Password</label>
              <div className="input-wrap">
                <input
                  id="password"
                  className="input"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="toggle-pass"
                  onClick={() => setShowPassword((s) => !s)}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            {error && (
              <p className="alert" role="alert">
                {error}
              </p>
            )}

            <button type="submit" className="btn block" disabled={busy}>
              {busy ? "Signing in..." : "Sign in"}
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}