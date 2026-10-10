// lib/post-login-path.ts
//
// Where each role lands right after it has an authenticated session
// (login, email verification, invitation acceptance). One mapping so the
// pages can't drift apart — a coach sent to the member dashboard first used
// to bounce through a client-side redirect and could end up in a loop.
export function postLoginPath(role: string | null | undefined): string {
  const r = (role ?? "").toUpperCase();
  if (r === "SUPER_ADMIN") return "/platform";
  if (r === "ADMIN" || r === "OWNER") return "/admin";
  if (r === "COACH") return "/dashboard/coach";
  return "/dashboard";
}
