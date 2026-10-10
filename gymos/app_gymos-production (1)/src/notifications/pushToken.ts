import { STORAGE_KEYS } from "@/config";
import { storage } from "@/lib/storage";
import { unregisterDevice } from "@/api/devices";

export const getStoredPushToken = () => storage.getItemAsync(STORAGE_KEYS.pushToken);
export const setStoredPushToken = (token: string) => storage.setItemAsync(STORAGE_KEYS.pushToken, token);
export const clearStoredPushToken = () => storage.deleteItemAsync(STORAGE_KEYS.pushToken);

/**
 * Sign-out step: tell the server this phone no longer belongs to the account
 * (must run while the session token is still valid), then forget the token
 * locally. Best-effort — signing out never fails because of it. If it can't
 * reach the server, the next account that signs in on this phone simply takes
 * the token over (the server re-assigns it), so it never leaks to the old user.
 */
export async function unregisterStoredPushToken(): Promise<void> {
  try {
    const token = await getStoredPushToken();
    if (!token) return;
    try {
      await unregisterDevice(token);
    } catch {
      /* offline / expired session: handled by server-side re-assignment */
    }
    await clearStoredPushToken();
  } catch {
    /* storage unavailable */
  }
}
