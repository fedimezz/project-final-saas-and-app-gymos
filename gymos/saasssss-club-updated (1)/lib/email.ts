import { safeImageUrl } from "@/lib/image-url";
import { fetchWithTimeout } from "@/lib/http";

// Escapes text before it's interpolated into an HTML email body.
export function escapeHtml(input: string): string {
  return input.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c] as string));
}

interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
}

// Provider order: SMTP (SMTP_HOST set — e.g. Gmail app password, Brevo, OVH, any mailbox)
// then Resend (RESEND_API_KEY + RESEND_FROM). SMTP needs no verified domain, which makes
// it the easy option for local testing and for clubs without their own domain.
async function sendViaSmtp({ to, subject, html }: SendEmailInput) {
  const { default: nodemailer } = await import("nodemailer");
  const port = Number(process.env.SMTP_PORT || 465);
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  const from = process.env.SMTP_FROM || process.env.RESEND_FROM || process.env.SMTP_USER;
  await transporter.sendMail({ from, to, subject, html });
}

export async function sendEmail({ to, subject, html }: SendEmailInput) {
  if (process.env.SMTP_HOST) {
    try {
      await sendViaSmtp({ to, subject, html });
      return;
    } catch (err) {
      console.error("[email] SMTP send failed:", err instanceof Error ? err.message : err);
      throw err;
    }
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!apiKey || !from) {
    console.error("[email] No email provider configured (set SMTP_HOST or RESEND_API_KEY + RESEND_FROM); email was not sent.");
    throw new Error("Email provider is not configured");
  }

  const res = await fetchWithTimeout("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      html,
    }),
  });

  if (!res.ok) {
    // Resend tells you why (unverified domain, test-mode recipient restriction...). Log it.
    const detail = await res.text().catch(() => "");
    console.error(`[email] Resend request failed (${res.status}): ${detail.slice(0, 300)}`);
    throw new Error(`Resend send failed (${res.status})`);
  }
}

export function verificationCodeEmail(code: string) {
  return {
    subject: "Votre code de vérification — Le Club de Gammarth",
    html: `<p>Votre code de vérification est :</p><p style="font-size:24px;font-weight:bold;letter-spacing:4px;">${code}</p><p>Ce code expire dans 15 minutes.</p>`,
  };
}

export function passwordResetCodeEmail(code: string) {
  return {
    subject: "Votre code de réinitialisation — Le Club de Gammarth",
    html: `<p>Votre code de réinitialisation est :</p><p style="font-size:24px;font-weight:bold;letter-spacing:4px;">${escapeHtml(code)}</p><p>Ce code expire dans 15 minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p>`,
  };
}

const ROLE_LABELS_FR: Record<string, string> = {
  OWNER: "propriétaire",
  ADMIN: "administrateur",
  COACH: "coach",
  MEMBER: "membre",
};

export function invitationEmail(input: {
  clubName: string;
  logoUrl?: string | null; // GymSettings.logoUrl; omitted/invalid → no logo
  inviterName: string;
  role: string;
  acceptUrl: string;
  expiresInDays: number;
}) {
  const club = escapeHtml(input.clubName);
  const inviter = escapeHtml(input.inviterName);
  const role = ROLE_LABELS_FR[input.role] ?? "utilisateur";
  const url = escapeHtml(input.acceptUrl);
  const logo = safeImageUrl(input.logoUrl);
  const logoHtml = logo && logo.startsWith("https://")
    ? `<p><img src="${escapeHtml(logo)}" alt="${club}" height="48" style="height:48px;max-width:200px;object-fit:contain"></p>`
    : "";

  return {
    subject: `Invitation à rejoindre ${input.clubName.replace(/[\r\n]+/g, " ")}`,
    html: `${logoHtml}<p>Bonjour,</p><p><strong>${inviter}</strong> vous a invité à rejoindre <strong>${club}</strong> en tant que ${role}.</p><p>Cliquez sur le lien ci-dessous pour choisir votre mot de passe et activer votre compte :</p><p><a href="${url}">${url}</a></p><p>Ce lien expire dans ${input.expiresInDays} jours et ne peut être utilisé qu'une seule fois. Si vous n'attendiez pas cette invitation, ignorez cet email.</p>`,
  };
}