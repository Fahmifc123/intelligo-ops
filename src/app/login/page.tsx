"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Login gagal");
        setLoading(false);
        return;
      }
      // Refresh biar proxy.ts re-evaluate cookie session yang baru diset,
      // baru redirect - router.push doang gak nge-refresh server state.
      router.replace(next);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setLoading(false);
    }
  }

  const inputClass =
    "w-full rounded-lg border border-outline-variant bg-surface px-3 py-2.5 font-inter text-body-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary";

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-light-bg px-4">
      <div className="w-full max-w-sm rounded-xl border border-outline-variant bg-surface-container-lowest p-8 shadow-sm">
        <div className="mb-6 text-center">
          <h1 className="font-geist text-headline-md text-primary">Intelligo Ops</h1>
          <p className="mt-1 font-inter text-body-sm text-text-muted">
            Masuk buat lanjut ke dashboard
          </p>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-stack-md">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="login-user" className="font-geist text-label-sm text-text-muted">
              Username
            </label>
            <input
              id="login-user"
              className={inputClass}
              autoComplete="username"
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="login-pass" className="font-geist text-label-sm text-text-muted">
              Password
            </label>
            <input
              id="login-pass"
              type="password"
              className={inputClass}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && (
            <p className="rounded-lg border border-error-container bg-error-container/40 p-3 font-inter text-body-sm text-on-error-container">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !username || !password}
            className="mt-2 rounded-lg bg-primary px-6 py-2.5 font-geist text-label-md text-on-primary transition-colors hover:bg-primary-container disabled:opacity-50"
          >
            {loading ? "Masuk..." : "Masuk"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  // useSearchParams butuh Suspense boundary di App Router.
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
