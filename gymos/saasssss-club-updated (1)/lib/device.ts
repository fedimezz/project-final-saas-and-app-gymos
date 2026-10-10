export type DeviceType = "PHONE" | "COMPUTER" | "UNKNOWN";

export function detectDevice(headers: Headers): DeviceType {
  const clientType = headers.get("x-client-type")?.toLowerCase();
  if (clientType === "mobile-app") return "PHONE";

  const userAgent = headers.get("user-agent") ?? "";
  if (/android|iphone|ipad|ipod|mobile|windows phone/i.test(userAgent)) return "PHONE";
  if (userAgent) return "COMPUTER";
  return "UNKNOWN";
}
