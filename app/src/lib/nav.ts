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
    { label: "Employees", href: "/employees", note: "Manage staff records", icon: "users", ready: false },
    { label: "Attendance", href: "/attendance", note: "Record and review attendance", icon: "clock", ready: false },
    { label: "Pay setup", href: "/pay-setup", note: "Rates, allowances, deductions", icon: "wallet", ready: false },
    { label: "Run payroll", href: "/payroll", note: "Process a pay period", icon: "play", ready: false },
    { label: "Payslips", href: "/payslips", note: "View all payslips", icon: "receipt", ready: false },
    { label: "Reports", href: "/reports", note: "Payroll and absence reports", icon: "chart", ready: false },
    { label: "Audit log", href: "/audit-log", note: "Who changed what", icon: "shield", ready: false },
  ],
  hr: [
    { label: "Employees", href: "/employees", note: "Manage staff records", icon: "users", ready: false },
    { label: "Attendance", href: "/attendance", note: "Record and review attendance", icon: "clock", ready: false },
    { label: "Reports", href: "/reports", note: "Absence and lateness reports", icon: "chart", ready: false },
  ],
  payroll: [
    { label: "Pay setup", href: "/pay-setup", note: "Rates, allowances, deductions", icon: "wallet", ready: false },
    { label: "Run payroll", href: "/payroll", note: "Process a pay period", icon: "play", ready: false },
    { label: "Payslips", href: "/payslips", note: "View all payslips", icon: "receipt", ready: false },
    { label: "Reports", href: "/reports", note: "Payroll reports", icon: "chart", ready: false },
  ],
  employee: [
    { label: "My attendance", href: "/my-attendance", note: "Your own attendance records", icon: "clock", ready: false },
    { label: "My payslips", href: "/my-payslips", note: "Your own payslips", icon: "receipt", ready: false },
  ],
};