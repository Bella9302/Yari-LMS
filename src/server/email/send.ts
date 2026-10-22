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
  const { RESEND_API_KEY, EMAIL_FROM, NODE_ENV, DEMO_MODE } = env();
  if (!RESEND_API_KEY) {
    if (NODE_ENV === "production" && DEMO_MODE !== "true")
      throw new Error("RESEND_API_KEY is not configured");
    // Demo servers log only the subject: message bodies can contain sign-in links.
    if (DEMO_MODE === "true") console.info(`[email:demo] not sent: "${message.subject}"`);
    else console.info(`\n[email] to=${message.to} subject="${message.subject}"\n${message.text}\n`);
    return;
  }
  resend ??= new Resend(RESEND_API_KEY);
  const { error } = await resend.emails.send({ from: EMAIL_FROM, ...message });
  if (error) throw new Error(`Email send failed: ${error.message}`);
}

/**
 * Sends many emails (e.g. an announcement) in batches of 100 via Resend's batch API.
 * Returns how many were accepted. Development without a key logs a summary instead.
 */
export async function sendEmailBatch(messages: EmailMessage[]): Promise<number> {
  if (messages.length === 0) return 0;
  const { RESEND_API_KEY, EMAIL_FROM, NODE_ENV, DEMO_MODE } = env();
  if (!RESEND_API_KEY) {
    if (NODE_ENV === "production" && DEMO_MODE !== "true")
      throw new Error("RESEND_API_KEY is not configured");
    console.info(`\n[email batch] ${messages.length} × "${messages[0]!.subject}"\n`);
    return messages.length;
  }
  resend ??= new Resend(RESEND_API_KEY);
  let sent = 0;
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100).map((m) => ({ from: EMAIL_FROM, ...m }));
    const { error } = await resend.batch.send(chunk);
    if (error) throw new Error(`Email batch failed: ${error.message}`);
    sent += chunk.length;
  }
  return sent;
}
