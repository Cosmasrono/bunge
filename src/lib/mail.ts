import nodemailer, { type Transporter } from "nodemailer";

/**
 * Email is sent through your own SMTP account. Set these in .env (and in Vercel):
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM (optional)
 * The Laravel-style names also work: MAIL_HOST, MAIL_PORT, MAIL_USERNAME, MAIL_PASSWORD,
 * MAIL_FROM_NAME, MAIL_FROM_ADDRESS. The SMTP_* names win if both are set.
 */
export const APP_NAME = process.env.APP_NAME || "PRS";
export const APP_URL = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");

const env = (...keys: string[]) => keys.map((k) => process.env[k]?.trim()).find(Boolean) || "";

const smtp = () => ({
  host: env("SMTP_HOST", "MAIL_HOST"),
  port: Number(env("SMTP_PORT", "MAIL_PORT") || 465),
  user: env("SMTP_USER", "MAIL_USERNAME"),
  pass: env("SMTP_PASS", "MAIL_PASSWORD"),
});

function fromAddress() {
  const explicit = env("MAIL_FROM");
  if (explicit) return explicit;
  const address = env("MAIL_FROM_ADDRESS") || smtp().user;
  const name = env("MAIL_FROM_NAME") || APP_NAME;
  return `${name.replace(/["<>]/g, "")} <${address}>`;
}

export function mailConfigured() {
  const { host, user, pass } = smtp();
  return Boolean(host && user && pass);
}

export function mailSummary() {
  return {
    configured: mailConfigured(),
    host: smtp().host,
    from: mailConfigured() ? fromAddress() : "",
  };
}

let transporter: Transporter | null = null;

function getTransport() {
  if (!mailConfigured()) throw new Error("Email isn't set up yet. Add the SMTP_* settings.");
  if (!transporter) {
    const { host, port, user, pass } = smtp();
    // Encryption is always required, except for a test mail server on this same computer.
    const localTestServer = ["localhost", "127.0.0.1"].includes(host);
    transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      requireTLS: port !== 465 && !localTestServer,
      ignoreTLS: localTestServer && port !== 465,
      auth: { user, pass },
      connectionTimeout: 15_000,
      socketTimeout: 20_000,
    });
  }
  return transporter;
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

type EmailContent = {
  heading: string;
  lines: string[];
  /** A one-time code shown large in the middle of the email. */
  code?: string;
  details?: [string, string][];
  button?: { text: string; url: string };
  footer?: string;
};

/** Builds matching plain-text and HTML bodies with a simple, clean layout. */
export function renderEmail({ heading, lines, code, details = [], button, footer }: EmailContent) {
  const text = [
    heading,
    "",
    ...lines,
    ...(code ? ["", `    ${code}`, ""] : []),
    ...(details.length ? ["", ...details.map(([k, v]) => `${k}: ${v}`)] : []),
    ...(button ? ["", `${button.text}: ${button.url}`] : []),
    "",
    `— ${APP_NAME}`,
    ...(footer ? [footer] : []),
  ].join("\n");

  const rows = details
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 12px 6px 0;color:#667085;font-size:14px;vertical-align:top;white-space:nowrap">${esc(k)}</td><td style="padding:6px 0;color:#1d2330;font-size:14px;white-space:pre-wrap">${esc(v)}</td></tr>`,
    )
    .join("");
  const html = `<!doctype html><html><body style="margin:0;background:#f4f5f7;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:14px;border:1px solid #e4e7ec">
<tr><td style="padding:18px 28px;border-bottom:1px solid #eef0f3;font-weight:700;color:#1d2330;font-size:15px">${esc(APP_NAME)}</td></tr>
<tr><td style="padding:26px 28px">
<h1 style="margin:0 0 14px;font-size:21px;line-height:1.3;color:#1d2330">${esc(heading)}</h1>
${lines.map((l) => `<p style="margin:0 0 12px;color:#344054;font-size:15px;line-height:1.55">${esc(l)}</p>`).join("")}
${code ? `<p style="margin:20px 0;text-align:center"><span style="display:inline-block;background:#eef0ff;color:#1d2330;border-radius:12px;padding:14px 22px;font:700 32px/1 ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:10px">${esc(code)}</span></p>` : ""}
${rows ? `<table role="presentation" style="margin:8px 0 4px;border-collapse:collapse">${rows}</table>` : ""}
${button ? `<p style="margin:22px 0 8px"><a href="${esc(button.url)}" style="background:#7a4527;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:9px;font-weight:600;display:inline-block;font-size:14px">${esc(button.text)}</a></p>` : ""}
${footer ? `<p style="margin:18px 0 0;color:#98a2b3;font-size:12px">${esc(footer)}</p>` : ""}
</td></tr></table>
<p style="color:#98a2b3;font-size:11px;margin:14px 0 0">Sent by ${esc(APP_NAME)}</p>
</td></tr></table></body></html>`;
  return { text, html };
}

export async function sendEmail(to: string, subject: string, content: EmailContent) {
  const { text, html } = renderEmail(content);
  await getTransport().sendMail({
    from: fromAddress(),
    to,
    subject: subject.replace(/[\r\n]+/g, " ").slice(0, 200),
    text,
    html,
  });
}
