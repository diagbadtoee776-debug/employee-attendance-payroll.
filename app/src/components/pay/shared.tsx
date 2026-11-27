"use client";

import { useEffect, type CSSProperties, type ReactNode } from "react";

export const filterLabel: CSSProperties = { display: "grid", gap: 4, fontSize: 12, color: "var(--muted)" };
export const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function first<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

export function Notices({ notice, error }: { notice: string | null; error: string | null }) {
  return (
    <>
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
    </>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}