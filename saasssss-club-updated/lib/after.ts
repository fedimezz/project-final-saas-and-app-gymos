// lib/after.ts
//
// Runs best-effort work (audit logs, notifications, emails) AFTER the response
// is sent, in a way that survives serverless freezing. A bare
// `void promise` / unawaited call can be dropped the moment the function
// returns on Vercel; Next's `after()` keeps the invocation alive until the
// callback settles.
//
// Outside a request scope (unit tests, scripts) `after()` throws; we then fall
// back to running the task immediately and swallowing its errors, so callers
// never need to care.
import { after } from "next/server";

export function runAfter(task: () => Promise<unknown> | unknown): void {
  const safe = async () => {
    try {
      await task();
    } catch (err) {
      console.error("[after] background task failed:", err instanceof Error ? err.message : err);
    }
  };
  try {
    after(safe);
  } catch {
    void safe();
  }
}
