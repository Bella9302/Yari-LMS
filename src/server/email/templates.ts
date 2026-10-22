import "server-only";
import type { EmailMessage } from "@/server/email/send";

// Minimal, inline-styled HTML that renders consistently across mail clients.
function layout(title: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;background:#F7F5F0;font-family:Georgia,serif;color:#0B0B0C">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border:1px solid #D9D5CC">
<tr><td style="padding:24px 28px;background:#0B0B0C;color:#F7F5F0;font-size:20px;letter-spacing:.08em">YARI ACADEMY</td></tr>
<tr><td style="padding:28px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6">
<h1 style="font-family:Georgia,serif;font-weight:normal;font-size:24px;margin:0 0 16px">${title}</h1>${bodyHtml}
</td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid #D9D5CC;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#5A5852">
YARI GROUP · Environmental Health &amp; Safety · Tech &amp; IT</td></tr>
</table></td></tr></table></body></html>`;
}

function button(href: string, label: string): string {
  return `<p style="margin:24px 0"><a href="${href}" style="display:inline-block;background:#0B0B0C;color:#F7F5F0;padding:12px 20px;text-decoration:none">${label}</a></p>
<p style="font-size:13px;color:#5A5852">Or paste this link into your browser:<br>${escapeHtml(href)}</p>`;
}

export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

export function inviteEmail(opts: {
  to: string;
  name: string;
  url: string;
  invitedBy: string;
  expiresDays: number;
}): EmailMessage {
  const name = escapeHtml(opts.name);
  return {
    to: opts.to,
    subject: "You're invited to YARI Academy",
    text: `Hello ${opts.name},\n\n${opts.invitedBy} has invited you to YARI Academy.\nSet up your account here (link valid for ${opts.expiresDays} days):\n${opts.url}\n\nIf you weren't expecting this, you can ignore this email.`,
    html: layout(
      `Welcome, ${name}`,
      `<p>${escapeHtml(opts.invitedBy)} has invited you to YARI Academy.</p>${button(opts.url, "Set up your account")}
<p style="font-size:13px;color:#5A5852">This link is valid for ${opts.expiresDays} days. If you weren't expecting this, you can ignore this email.</p>`,
    ),
  };
}

export function passwordResetEmail(opts: { to: string; url: string }): EmailMessage {
  return {
    to: opts.to,
    subject: "Reset your YARI Academy password",
    text: `Someone asked to reset the password for this account.\nReset it here (valid for 1 hour):\n${opts.url}\n\nIf this wasn't you, ignore this email — your password won't change.`,
    html: layout(
      "Reset your password",
      `<p>Someone asked to reset the password for this account.</p>${button(opts.url, "Choose a new password")}
<p style="font-size:13px;color:#5A5852">This link is valid for 1 hour. If this wasn't you, ignore this email — your password won't change.</p>`,
    ),
  };
}

export function certificateEmail(opts: {
  to: string;
  name: string;
  course: string;
  url: string;
}): EmailMessage {
  return {
    to: opts.to,
    subject: `Your certificate: ${opts.course}`,
    text: `Well done, ${opts.name}.\n\nYou've completed ${opts.course}. Download your Certificate of Completion here:\n${opts.url}\n\nThis is a record of attendance and completion. It is not an accredited qualification.`,
    html: layout(
      `Well done, ${escapeHtml(opts.name)}`,
      `<p>You've completed <strong>${escapeHtml(opts.course)}</strong>. Your Certificate of Completion is ready.</p>${button(opts.url, "Get your certificate")}
<p style="font-size:13px;color:#5A5852">This is a record of attendance and completion. It is not an accredited qualification.</p>`,
    ),
  };
}

export function enquiryEmail(opts: {
  to: string;
  from: string;
  interest: string;
  course: string | null;
  url: string;
}): EmailMessage {
  // Contact details stay in the platform: the email only says there is something to answer.
  const what = `${opts.interest}${opts.course ? ` · ${opts.course}` : ""}`;
  return {
    to: opts.to,
    subject: `New enquiry: ${what}`,
    text: `A new enquiry has come in from ${opts.from} (${what}).\nRead and answer it here:\n${opts.url}`,
    html: layout(
      "New enquiry",
      `<p>A new enquiry has come in from ${escapeHtml(opts.from)} (${escapeHtml(what)}).</p>${button(opts.url, "Open the enquiry")}`,
    ),
  };
}
