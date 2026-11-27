import type { Role } from "@/components/AuthProvider";
import type { IconName } from "@/components/Icon";

export type NavItem = {
  label: string;
  href: string;
  note: string;
  icon: IconName;
  ready: boolean; // set to true as each module is built
};

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Administrator",
  hr: "HR",
  payroll: "Payroll",
  employee: "Employee",
};

// Which modules each role may open. The database (RLS) enforces the same rules.
export const NAV: Record<Role, NavItem[]> = {
  admin: [
    { label: "Employees", href: "/employees", note: "Manage staff records", icon: "users", ready: true },
    { label: "Attendance", href: "/attendance", note: "Record and review attendance", icon: "clock", ready: true },
    { label: "Pay setup", href: "/pay-setup", note: "Rates, allowances, deductions", icon: "wallet", ready: true },
    { label: "Run payroll", href: "/payroll", note: "Process a pay period", icon: "play", ready: true },
    { label: "Payslips", href: "/payslips", note: "View all payslips", icon: "receipt", ready: true },
    { label: "Reports", href: "/reports", note: "Payroll and absence reports", icon: "chart", ready: true },
    { label: "Audit log", href: "/audit-log", note: "Who changed what", icon: "shield", ready: true },
  ],
  hr: [
    { label: "Employees", href: "/employees", note: "Manage staff records", icon: "users", ready: true },
    { label: "Attendance", href: "/attendance", note: "Record and review attendance", icon: "clock", ready: true },
    { label: "Reports", href: "/reports", note: "Absence and lateness reports", icon: "chart", ready: true },
  ],
  payroll: [
    { label: "Pay setup", href: "/pay-setup", note: "Rates, allowances, deductions", icon: "wallet", ready: true },
    { label: "Run payroll", href: "/payroll", note: "Process a pay period", icon: "play", ready: true },
    { label: "Payslips", href: "/payslips", note: "View all payslips", icon: "receipt", ready: true },
    { label: "Reports", href: "/reports", note: "Payroll reports", icon: "chart", ready: true },
  ],
  employee: [
    { label: "My attendance", href: "/attendance", note: "Your own attendance records", icon: "clock", ready: true },
    { label: "My payslips", href: "/payslips", note: "View your own payslips", icon: "receipt", ready: true },
  ],
};