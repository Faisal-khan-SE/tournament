'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, Loader2, X } from 'lucide-react';

/* ------------------------------------------------------------------ */
/* Toasts — replaces the alert() calls the app used for every outcome. */
/* ------------------------------------------------------------------ */

type ToastKind = 'success' | 'error' | 'info';
interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

const ToastContext = createContext<(kind: ToastKind, message: string) => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-[calc(100vw-2rem)] sm:max-w-sm">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm shadow-2xl backdrop-blur ${
              t.kind === 'success'
                ? 'bg-cricket-950/95 border-cricket-700 text-cricket-200'
                : t.kind === 'error'
                ? 'bg-red-950/95 border-red-700 text-red-200'
                : 'bg-pitch-card/95 border-pitch-border text-gray-200'
            }`}
          >
            {t.kind === 'success' ? (
              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
            ) : t.kind === 'error' ? (
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            ) : (
              <Info className="w-4 h-4 mt-0.5 shrink-0" />
            )}
            <span className="flex-1 leading-snug">{t.message}</span>
            <button
              onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}
              aria-label="Dismiss"
              className="text-current/60 hover:text-current"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const push = useContext(ToastContext);
  return {
    success: (m: string) => push('success', m),
    error: (m: string) => push('error', m),
    info: (m: string) => push('info', m),
  };
}

/* ------------------------------------------------------------------ */
/* Confirm dialog — every destructive action goes through this.        */
/* ------------------------------------------------------------------ */

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Delete',
  danger = true,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-pitch-card border border-pitch-border rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4"
      >
        <div className="flex items-start gap-3">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
              danger ? 'bg-red-950 border border-red-800' : 'bg-amber-950 border border-amber-800'
            }`}
          >
            <AlertTriangle className={`w-5 h-5 ${danger ? 'text-red-400' : 'text-amber-400'}`} />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">{title}</h3>
            <p className="text-xs text-gray-300 mt-1 leading-relaxed">{message}</p>
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <button
            onClick={onCancel}
            disabled={busy}
            className="flex-1 py-2.5 rounded-xl bg-pitch-dark border border-pitch-border text-xs font-semibold text-gray-300 hover:bg-pitch-border/40 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold text-white disabled:opacity-50 flex items-center justify-center gap-1.5 ${
              danger ? 'bg-red-600 hover:bg-red-500' : 'bg-amber-600 hover:bg-amber-500'
            }`}
          >
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Small shared pieces                                                 */
/* ------------------------------------------------------------------ */

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
      <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-cricket-500" />
      {label && <p className="text-xs text-gray-400">{label}</p>}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  message: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="p-10 text-center bg-pitch-card border border-dashed border-pitch-border rounded-2xl">
      {icon && <div className="flex justify-center mb-3 text-gray-500">{icon}</div>}
      <h3 className="text-base font-bold text-gray-200">{title}</h3>
      <p className="text-xs text-gray-400 mt-1.5 max-w-sm mx-auto leading-relaxed">{message}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

const STATUS_STYLES: Record<string, string> = {
  LIVE: 'bg-red-950 border-red-700 text-red-300',
  INNINGS_BREAK: 'bg-amber-950 border-amber-700 text-amber-300',
  COMPLETED: 'bg-cricket-950 border-cricket-700 text-cricket-300',
  SCHEDULED: 'bg-pitch-dark border-pitch-border text-gray-300',
  TOSS: 'bg-pitch-dark border-pitch-border text-gray-300',
  ABANDONED: 'bg-gray-900 border-gray-700 text-gray-400',
};

const STATUS_LABELS: Record<string, string> = {
  LIVE: 'Live',
  INNINGS_BREAK: 'Innings break',
  COMPLETED: 'Completed',
  SCHEDULED: 'Scheduled',
  TOSS: 'Toss',
  ABANDONED: 'Abandoned',
};

export function StatusBadge({ status, className = '' }: { status: string; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase tracking-wide ${
        STATUS_STYLES[status] || STATUS_STYLES.SCHEDULED
      } ${className}`}
    >
      {status === 'LIVE' && <span className="w-1.5 h-1.5 rounded-full bg-red-500 live-pulse" />}
      {STATUS_LABELS[status] || status}
    </span>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-gray-300 mb-1.5">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-gray-500 mt-1">{hint}</span>}
    </label>
  );
}

export const inputClass =
  'w-full px-3 py-2.5 bg-pitch-dark border border-pitch-border rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cricket-600 focus:border-transparent';

/** Shared fetch wrapper: unwraps { success, error } and throws a usable message. */
export async function apiCall<T = any>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => ({ success: false, error: 'Unexpected server response' }));
  // A write without a session: send the user to sign in and come back here.
  if (res.status === 401 && data.unauthorised && typeof window !== 'undefined') {
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = `/login?next=${next}`;
  }
  if (!data.success) {
    const err: any = new Error(data.error || `Request failed (${res.status})`);
    err.requiresConfirmation = data.requiresConfirmation;
    err.payload = data;
    throw err;
  }
  return data;
}
