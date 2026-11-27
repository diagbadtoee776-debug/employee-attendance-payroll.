"use client";

import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import AppShell from "@/components/AppShell";
import PayRatesTab from "@/components/pay/PayRatesTab";
import AllowancesTab from "@/components/pay/AllowancesTab";
import DeductionsTab from "@/components/pay/DeductionsTab";

type Tab = "rates" | "allowances" | "deductions";

const TABS: { key: Tab; label: string }[] = [
  { key: "rates", label: "Pay rates" },
  { key: "allowances", label: "Allowances" },
  { key: "deductions", label: "Deductions" },
];

export default function PaySetupPage() {
  const { role } = useAuth();
  const [tab, setTab] = useState<Tab>("rates");
  const allowed = role === "admin" || role === "payroll";

  return (
    <AppShell title="Pay setup" subtitle="Hourly rates, allowances and deductions used by payroll runs.">
      {!allowed ? (
        <p className="alert" role="alert">
          Only administrators and payroll staff can open pay setup.
        </p>
      ) : (
        <>
          <div className="toolbar">
            {TABS.map((t) => (
              <button
                key={t.key}
                className={`btn small ${tab === t.key ? "" : "outline"}`}
                onClick={() => setTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "rates" && <PayRatesTab />}
          {tab === "allowances" && <AllowancesTab />}
          {tab === "deductions" && <DeductionsTab />}
        </>
      )}
    </AppShell>
  );
}