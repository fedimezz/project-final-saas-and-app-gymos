// src/lib/sms.ts
//
// Sends SMS through TextBee using the existing provider-neutral sendSms API.

import { toE164 } from "@/lib/phone";
import { fetchWithTimeout } from "@/lib/http";

export function isSmsConfigured(): boolean {
  return Boolean(process.env.TEXTBEE_API_KEY);
}

// Destination allow-list (SMS pumping / toll fraud): an attacker who can make
// the app text arbitrary numbers can make it text premium-rate numbers in
// other countries. Only these country calling codes are ever sent to.
// Override with SMS_ALLOWED_COUNTRY_CODES="+216,+33" for a wider market.
function allowedCountryCodes(): string[] {
  return (process.env.SMS_ALLOWED_COUNTRY_CODES || "+216")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
}

// E.164 normalisation lives in lib/phone.ts (pure, shared with the client);
// re-exported here so existing imports keep working.
export { toE164 };

export function isSmsDestinationAllowed(e164: string): boolean {
  return allowedCountryCodes().some((cc) => e164.startsWith(cc));
}

interface SendSmsInput {
  to: string; // any user-typed format; normalised + allow-listed below
  body: string;
}

export async function sendSms({ to, body }: SendSmsInput): Promise<void> {
  const destination = toE164(to);
  if (!destination || !isSmsDestinationAllowed(destination)) {
    // Deliberately not logging the number.
    throw new Error("SMS destination rejected (invalid or not in allowed countries)");
  }

  const apiKey = process.env.TEXTBEE_API_KEY;
  if (!apiKey) {
    if (process.env.NODE_ENV === "production") {
      console.error("[sms] TextBee is not configured; SMS was not sent.");
      throw new Error("SMS provider is not configured");
    }
    console.warn("[sms:dev] TextBee is not configured; SMS was not sent.");
    return;
  }

  const deviceId = process.env.TEXTBEE_DEVICE_ID?.trim();

  const res = await fetchWithTimeout(
    `${(process.env.TEXTBEE_BASE_URL || "https://api.textbee.dev/api/v1").replace(/\/$/, "")}/gateway/send-sms`,
    {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
    },
      body: JSON.stringify({
        recipients: [destination],
        message: body,
        ...(deviceId ? { deviceId } : {}),
      }),
    }
  );

  if (!res.ok) {
    throw new Error(`TextBee SMS send failed (${res.status})`);
  }
}

// `brand` is the club's display name. These used to hardcode
// "Le Club de Gammarth" for every tenant.
export function verificationCodeSms(code: string, brand = "GymOS"): string {
  return `${brand} : votre code de vérification est ${code}. Il expire dans 15 minutes.`;
}

export function sessionReminderSms(activity: string, startTime: string, brand = "GymOS"): string {
  return `${brand} : rappel — votre séance de ${activity} commence aujourd'hui à ${startTime}.`;
}
