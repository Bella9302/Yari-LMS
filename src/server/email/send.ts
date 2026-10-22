import "server-only";
import { Resend } from "resend";
import { env } from "@/server/env";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

let resend: Resend | undefined;

/**
 * Sends an email via Resend. Without RESEND_API_KEY (local development) the
 * message is printed to the server console instead; in production a missing key is an error.
 */
export async function sendEmail(message: EmailMessage): Promise<void> {
  const { RESEND_API_KEY, EMAIL_FROM, NODE_ENV } = env();
  if (!RESEND_API_KEY) {
    if (NODE_ENV === "production") throw new Error("RESEND_API_KEY is not configured");
    console.info(`\n[email] to=${message.to} subject="${message.subject}"\n${message.text}\n`);
    return;
  }
  resend ??= new Resend(RESEND_API_KEY);
  const { error } = await resend.emails.send({ from: EMAIL_FROM, ...message });
  if (error) throw new Error(`Email send failed: ${error.message}`);
}
