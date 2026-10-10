import { apiDelete, apiPost } from "@/api/client";

export interface DeviceRegistration {
  token: string;
  platform: "ios" | "android";
  deviceName?: string;
  appVersion?: string;
}

/** Register (or refresh) this phone's push token for the signed-in account. */
export function registerDevice(device: DeviceRegistration): Promise<{ registered: true }> {
  return apiPost<{ registered: true }>("/api/devices", device);
}

/** Stop receiving pushes on this phone for the signed-in account. Idempotent. */
export function unregisterDevice(token: string): Promise<{ unregistered: true }> {
  return apiDelete<{ unregistered: true }>("/api/devices", { token });
}
