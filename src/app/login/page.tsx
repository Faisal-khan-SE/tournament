'use client';

import { FormEvent, Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Lock, LogIn } from 'lucide-react';
import { Field, apiCall, inputClass } from '@/components/ui';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') || '/';

  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState<boolean | null>(null);

  // No password configured means the site is open; there is nothing to sign into.
  useEffect(() => {
    apiCall('/api/auth/session')
      .then((s) => {
        setEnabled(s.enabled);
        if (!s.enabled || s.loggedIn) router.replace(next);
      })
      .catch(() => setEnabled(true));
  }, [router, next]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiCall('/api/auth/login', { method: 'POST', body: JSON.stringify({ password }) });
      router.replace(next);
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (enabled === null) return null;

  return (
    <div className="max-w-sm mx-auto px-4 py-16">
      <div className="bg-pitch-card border border-pitch-border rounded-2xl p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cricket-900/60 flex items-center justify-center">
            <Lock className="w-5 h-5 text-cricket-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">Organiser sign-in</h1>
            <p className="text-xs text-gray-400">Scoring and editing need the admin password.</p>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <Field label="Password">
            <input
              type="password"
              autoFocus
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
            />
          </Field>
          {error && <p className="text-xs text-red-400 font-semibold">{error}</p>}
          <button
            type="submit"
            disabled={busy || !password}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-cricket-600 hover:bg-cricket-500 text-sm font-bold text-white disabled:opacity-50"
          >
            <LogIn className="w-4 h-4" /> {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
