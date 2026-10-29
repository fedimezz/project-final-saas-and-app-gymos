// lib/http.ts — outbound HTTP with a hard timeout.
//
// A hung third party (Stripe, TextBee, Resend, Google, Cloudinary) must never
// pin a serverless function until the platform kills it.

export const DEFAULT_OUTBOUND_TIMEOUT_MS = 10_000;

export async function fetchWithTimeout(
  input: string | URL,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_OUTBOUND_TIMEOUT_MS
): Promise<Response> {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const signal = init.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal;
  return fetch(input, { ...init, signal });
}
