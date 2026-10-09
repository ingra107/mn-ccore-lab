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
 * Who receives the daily digest and the morning pulse. Nick only, for now
 * (Nick, 2026-10-09). To widen: add slugs here, or set the DIGEST_RECIPIENTS
 * variable on the Worker to a comma list of slugs, or to "all".
 */
export const DEFAULT_DIGEST_RECIPIENT_SLUGS: readonly string[] = ['nick-ingraham'];

export function isDigestRecipient(slug: string, env: { DIGEST_RECIPIENTS?: string }): boolean {
  const setting = env.DIGEST_RECIPIENTS?.trim();
  if (setting === 'all') return true;
  const allowed = setting
    ? setting.split(',').map((s) => s.trim()).filter(Boolean)
    : DEFAULT_DIGEST_RECIPIENT_SLUGS;
  return allowed.includes(slug);
}

// ── Sending ───────────────────────────────────────────────────

interface EmailOptions {
  to: string;
  subject: string;
  html: SafeHtml;
}

export async function sendEmail(apiKey: string, options: EmailOptions): Promise<boolean> {
  try {
    const res = await fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: options.to,
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
