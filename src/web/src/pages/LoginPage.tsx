import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate } from "react-router";
import { useAuthStore } from "../stores/auth.ts";

export function LoginPage() {
  const { isAuthenticated, isLoading, error, login, clearError } = useAuthStore();
  const [password, setPassword] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus on input after error
  useEffect(() => {
    if (error && inputRef.current) {
      inputRef.current.focus();
    }
  }, [error]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const ok = await login(password);
      if (!ok && inputRef.current) {
        inputRef.current.focus();
        inputRef.current.select();
      }
    },
    [login, password],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setPassword(e.target.value);
      if (error) clearError();
    },
    [error, clearError],
  );

  // Already authenticated -> redirect to /
  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return (
    <main
      id="main"
      className="flex min-h-screen items-center justify-center px-4"
      style={{ touchAction: "manipulation" }}
    >
      <div className="w-full max-w-[400px]">
        {/* Logo */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: "#17b862" }}>
            COMBINE TRADE
          </h1>
          <p className="mt-1 text-sm" style={{ color: "#94a3b8" }}>
            Double-BB 자동매매 시스템
          </p>
        </div>

        {/* Login Card */}
        <div
          className="rounded-lg border p-6"
          style={{
            backgroundColor: "#1e293b",
            borderColor: "#334155",
          }}
        >
          <form onSubmit={handleSubmit} noValidate>
            {/* Password field */}
            <div className="mb-4">
              <label
                htmlFor="password"
                className="mb-1.5 block text-sm font-medium"
                style={{ color: "#f1f5f9" }}
              >
                비밀번호
              </label>
              <input
                ref={inputRef}
                id="password"
                type="password"
                autoComplete="current-password"
                spellCheck={false}
                placeholder="비밀번호를 입력하세요…"
                value={password}
                onChange={handleChange}
                disabled={isLoading}
                aria-invalid={error ? "true" : undefined}
                aria-describedby={error ? "password-error" : undefined}
                className="focus-visible:outline-primary-500 w-full rounded-md border px-3 py-2 text-sm outline-none transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
                style={{
                  backgroundColor: "#0f172a",
                  borderColor: error ? "#ef4444" : "#334155",
                  color: "#f1f5f9",
                }}
              />
              {error && (
                <p
                  id="password-error"
                  className="mt-1.5 text-[13px]"
                  style={{ color: "#ef4444" }}
                  role="alert"
                >
                  {error}
                </p>
              )}
            </div>

            {/* Submit button */}
            <button
              type="submit"
              disabled={isLoading}
              className="focus-visible:outline-primary-500 flex w-full items-center justify-center rounded-md px-4 py-2 text-sm font-semibold text-white transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-50"
              style={{
                backgroundColor: isLoading ? "#0a954e" : "#17b862",
              }}
              onMouseDown={(e) => {
                if (!isLoading) {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#097840";
                }
              }}
              onMouseUp={(e) => {
                if (!isLoading) {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#0a954e";
                }
              }}
              onMouseLeave={(e) => {
                if (!isLoading) {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#17b862";
                }
              }}
              onMouseEnter={(e) => {
                if (!isLoading) {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#0a954e";
                }
              }}
            >
              {isLoading ? (
                <>
                  <svg
                    className="mr-2 h-4 w-4 animate-spin"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  로그인 중…
                </>
              ) : (
                "로그인"
              )}
            </button>
          </form>

          {/* Version */}
          <p className="mt-4 text-center text-xs" style={{ color: "#64748b" }}>
            v0.1.0
          </p>
        </div>
      </div>
    </main>
  );
}
