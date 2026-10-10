"use client";

// Generic confirmation modal for the /platform area.
// Render it conditionally ({dialog && <ConfirmDialog … />}) so its internal
// state resets every time it opens.
import { useEffect, useId, useRef, useState } from "react";
import { AlertTriangle, Loader2, X } from "lucide-react";

interface ConfirmDialogProps {
  readonly title: string;
  readonly description?: React.ReactNode;
  readonly confirmLabel: string;
  readonly tone?: "danger" | "default";
  /** Confirm stays disabled until the user types exactly this (e.g. the club slug). */
  readonly requireText?: string;
  /** Optional extra input (reason, new password, …). Its value is passed to onConfirm. */
  readonly inputLabel?: string;
  readonly inputPlaceholder?: string;
  readonly inputType?: "text" | "password" | "number";
  readonly inputRequired?: boolean;
  readonly inputMin?: number;
  readonly inputMax?: number;
  readonly loading?: boolean;
  readonly error?: string | null;
  readonly onConfirm: (value: string) => void;
  readonly onCancel: () => void;
}

function getFocusableElements(dialog: HTMLDialogElement | null): NodeListOf<HTMLElement> | undefined {
  return dialog?.querySelectorAll<HTMLElement>(
    'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
  );
}

export default function ConfirmDialog({
  title, description, confirmLabel, tone = "default", requireText,
  inputLabel, inputPlaceholder, inputType = "text", inputRequired = false, inputMin, inputMax,
  loading = false, error, onConfirm, onCancel,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState("");
  const [value, setValue] = useState("");
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    (getFocusableElements(dialogRef.current)?.[0] ?? dialogRef.current)?.focus();
    return () => previousFocus?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) onCancel();
      if (e.key !== "Tab") return;
      const items = getFocusableElements(dialogRef.current);
      if (!items?.length) {
        e.preventDefault();
        dialogRef.current?.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || !dialogRef.current?.contains(document.activeElement))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !dialogRef.current?.contains(document.activeElement))) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [loading, onCancel]);

  const textOk = !requireText || typed.trim().toLowerCase() === requireText.toLowerCase();
  const inputOk = !inputRequired || value.trim() !== "";
  const canConfirm = textOk && inputOk && !loading;
  const danger = tone === "danger";

  return (
    <dialog
      open
      ref={dialogRef}
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-70 m-0 flex h-full max-h-none w-full max-w-none items-end justify-center border-0 bg-slate-950/60 p-4 backdrop-blur-sm sm:items-center"
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <div className="flex items-start gap-3">
          {danger && (
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-500/10 text-rose-500">
              <AlertTriangle className="h-4 w-4" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-sm font-black text-primary">{title}</h2>
            {description && <div className="mt-1.5 text-xs leading-relaxed text-secondary">{description}</div>}
          </div>
          <button type="button" onClick={onCancel} disabled={loading} aria-label="Fermer" className="text-muted hover:text-primary disabled:opacity-40">
            <X className="h-4 w-4" />
          </button>
        </div>

        {inputLabel && (
          <label className="mt-4 block">
            <span className="text-[11px] font-bold text-secondary">{inputLabel}</span>
            <input
              autoFocus
              type={inputType}
              min={inputMin}
              max={inputMax}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={inputPlaceholder}
              autoComplete={inputType === "password" ? "new-password" : "off"}
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-xs text-primary focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
          </label>
        )}

        {requireText && (
          <label className="mt-4 block">
            <span className="text-[11px] font-bold text-secondary">
              Tapez <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-primary">{requireText}</code> pour confirmer
            </span>
            <input
              autoFocus={!inputLabel}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 font-mono text-xs text-primary focus:outline-none focus:ring-2 focus:ring-rose-500/40"
            />
          </label>
        )}

        {error && <p className="mt-3 rounded-xl bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-500" role="alert">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={loading} className="rounded-full border border-border px-4 py-2 text-xs font-bold text-secondary disabled:opacity-40">
            Annuler
          </button>
          <button
            type="button"
            onClick={() => onConfirm(value.trim())}
            disabled={!canConfirm}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-xs font-extrabold disabled:opacity-40 ${
              danger ? "bg-rose-500 text-white" : "bg-emerald-500 text-slate-950"
            }`}
          >
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}