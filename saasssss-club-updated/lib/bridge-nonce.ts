// Name of the short-lived cookie that binds a bridge token to the browser that
// created the club. Set by /api/onboarding/create-club, checked and cleared by
// /api/auth/bridge. Kept in its own tiny module so both routes agree.
export const BRIDGE_NONCE_COOKIE = "bridge_nonce";
