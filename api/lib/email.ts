/**
 * Email notifications via Resend (3,000/month free).
 * All functions gracefully degrade when RESEND_API_KEY is not set.
 */

const RESEND_URL = 'https://api.resend.com/emails';
const FROM_EMAIL = 'MN-CCORE Hub <hub@mnccore.org>';
const HUB_URL = 'https://mn-ccore-lab.pages.dev';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
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
        html: options.html,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function taskAssignmentEmail(assignerName: string, taskTitle: string, taskId: string): EmailOptions {
  return {
    to: '', // filled by caller
    subject: `${assignerName} assigned you: ${taskTitle}`,
    html: `
      <div style="font-family: 'DM Sans', sans-serif; max-width: 500px; margin: 0 auto; padding: 24px;">
        <div style="background: #0b1017; color: #e2e8f0; padding: 16px 20px; border-radius: 8px 8px 0 0;">
          <strong style="color: #c9a84c;">MN-CCORE Hub</strong>
        </div>
        <div style="background: #ffffff; padding: 20px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 8px 8px;">
          <p style="margin: 0 0 12px; color: #0f1923;"><strong>${assignerName}</strong> assigned you a task:</p>
          <p style="margin: 0 0 16px; color: #0f1923; font-size: 16px; font-weight: 500;">${taskTitle}</p>
          <a href="${HUB_URL}/portal/my-tasks?open=${encodeURIComponent(taskId)}" style="display: inline-block; padding: 8px 20px; background: #2d8a8a; color: white; text-decoration: none; border-radius: 6px; font-size: 14px;">
            View Task
          </a>
        </div>
      </div>
    `,
  };
}

