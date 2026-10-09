/**
 * Email notifications via Resend (3,000/month free).
 * All functions gracefully degrade when RESEND_API_KEY is not set.
 *
 * Every email the Hub sends goes through sendEmail, and sendEmail only takes
 * SafeHtml. The `html` tag below escapes every value you put in a template, so
 * text from a task title or a person's name cannot reach the page as markup.
 * The one way around it is raw(), which is greppable: each raw( call is a place
 * where the author vouches that the string is already escaped.
 */

import { escapeHtml } from './escapeHtml';

const RESEND_URL = 'https://api.resend.com/emails';
const FROM_EMAIL = 'MN-CCORE Hub <hub@mnccore.org>';

/** Public origin of the site. The Hub lives under /portal on this origin. */
export const HUB_URL = 'https://mnccore.org';

// ── Safe HTML ─────────────────────────────────────────────────

export class SafeHtml {
  constructor(readonly value: string) {}
  toString(): string {
    return this.value;
  }
}

/** Mark a string as already-escaped HTML. Use only for text you escaped yourself or wrote as a literal. */
export function raw(s: string): SafeHtml {
  return new SafeHtml(s);
}

type Interpolation = string | number | null | undefined | SafeHtml | readonly SafeHtml[];

function renderValue(v: Interpolation): string {
  if (v instanceof SafeHtml) return v.value;
  if (Array.isArray(v)) return v.map((x) => x.value).join('');
  if (v === null || v === undefined) return '';
  return escapeHtml(String(v));
}

/** Tagged template: literal parts pass through, every interpolated value is HTML-escaped. */
export function html(strings: TemplateStringsArray, ...values: Interpolation[]): SafeHtml {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) {
    out += renderValue(values[i]) + strings[i + 1];
  }
  return new SafeHtml(out);
}

// ── Recipient policy ──────────────────────────────────────────

/**
 * Who may receive ANY email from the Hub (daily digest, morning pulse, task
 * assignment). Nick only, for now (Nick, 2026-10-09). sendEmail checks this
 * itself, so no caller can send around it.
 *
 * To widen: add addresses here, or set DIGEST_RECIPIENTS on BOTH the Worker
 * and the Pages project to a comma list of addresses, or to "all"
 * (case-insensitive). The setting REPLACES this default list.
 */
export const DEFAULT_EMAIL_RECIPIENTS: readonly string[] = [
  'ingra107@umn.edu',
  'nicholas.ingraham@gmail.com',
];

interface RecipientEnv {
  RESEND_API_KEY?: string;
  DIGEST_RECIPIENTS?: string;
}

function allowedAddresses(env: RecipientEnv): 'all' | readonly string[] {
  const setting = env.DIGEST_RECIPIENTS?.trim();
  if (!setting) return DEFAULT_EMAIL_RECIPIENTS;
  if (setting.toLowerCase() === 'all') return 'all';
  return setting.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

export function isEmailRecipient(address: string, env: RecipientEnv): boolean {
  const allowed = allowedAddresses(env);
  return allowed === 'all' || allowed.includes(address.trim().toLowerCase());
}

let warnedNoRecipient = false;
/** Log once per isolate when DIGEST_RECIPIENTS is set but a send found nobody it allows. */
export function warnIfRecipientsMatchNobody(env: RecipientEnv): void {
  const setting = env.DIGEST_RECIPIENTS?.trim();
  if (!setting || warnedNoRecipient) return;
  warnedNoRecipient = true;
  console.warn(`[email] DIGEST_RECIPIENTS="${setting}" matched no recipient; nothing was sent. Use "all" or a comma list of addresses.`);
}
/** Test hook. */
export function _resetRecipientWarning(): void {
  warnedNoRecipient = false;
}

// ── Sending ───────────────────────────────────────────────────

interface EmailOptions {
  to: string;
  subject: string;
  html: SafeHtml;
}

/** Sends one email if the recipient passes the single gate. Returns false when blocked or rejected. */
export async function sendEmail(env: RecipientEnv, options: EmailOptions): Promise<boolean> {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) return false;
  // Check and send the SAME trimmed address, so the gate cannot approve one
  // string and Resend receive another.
  const to = options.to.trim();
  if (!isEmailRecipient(to, env)) {
    warnIfRecipientsMatchNobody(env);
    return false;
  }
  try {
    const res = await fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to,
        subject: options.subject,
        html: options.html.value,
      }),
    });
    if (!res.ok) {
      console.error(`[email] Resend rejected send: ${res.status}`);
    }
    return res.ok;
  } catch (e) {
    console.error('[email] Resend request failed:', (e as Error).message);
    return false;
  }
}

export function taskAssignmentEmail(assignerName: string, taskTitle: string, taskId: string): EmailOptions {
  const link = `${HUB_URL}/portal/my-tasks?open=${encodeURIComponent(taskId)}`;
  return {
    to: '', // filled by caller
    // Subject is plain text, not HTML; strip line breaks so a title cannot add headers.
    subject: `${assignerName} assigned you: ${taskTitle}`.replace(/[\r\n]+/g, ' '),
    html: html`
      <div style="font-family: 'DM Sans', sans-serif; max-width: 500px; margin: 0 auto; padding: 24px;">
        <div style="background: #0b1017; color: #e2e8f0; padding: 16px 20px; border-radius: 8px 8px 0 0;">
          <strong style="color: #c9a84c;">MN-CCORE Hub</strong>
        </div>
        <div style="background: #ffffff; padding: 20px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 8px 8px;">
          <p style="margin: 0 0 12px; color: #0f1923;"><strong>${assignerName}</strong> assigned you a task:</p>
          <p style="margin: 0 0 16px; color: #0f1923; font-size: 16px; font-weight: 500;">${taskTitle}</p>
          <a href="${link}" style="display: inline-block; padding: 8px 20px; background: #2d8a8a; color: white; text-decoration: none; border-radius: 6px; font-size: 14px;">
            View Task
          </a>
        </div>
      </div>
    `,
  };
}
