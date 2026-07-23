/**
 * Email a fixed admin address when a new account registers and needs approval. The in-app pending
 * badge (PR #155) only alerts an admin who opens the app; this pushes a notification so a new
 * registration isn't missed.
 *
 * Fires on `users/{uid}` CREATE — the account record is server-created by `syncUserClaims` on first
 * sign-in, so a create ≈ a new registration. Skips admins / already-approved accounts. Sends via the
 * Zoho SMTP account (`no-reply@46advance.com`) with nodemailer.
 *
 * Requires the `SMTP_PASSWORD` secret (the Zoho account/app password — set with
 * `firebase functions:secrets:set SMTP_PASSWORD`). Recipient is the `REGISTRATION_NOTIFY_TO` param
 * (defaults to jared@46entertainment.com). Non-fatal: a send failure is logged, never thrown, so a
 * mail hiccup can't affect registration or retry-storm the trigger.
 */
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { defineSecret, defineString } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import nodemailer from 'nodemailer';
import { buildRegistrationNotice } from './lib/notify/registrationEmail.js';

const SMTP_PASSWORD = defineSecret('SMTP_PASSWORD');
const NOTIFY_TO = defineString('REGISTRATION_NOTIFY_TO', { default: 'jared@46entertainment.com' });

const SMTP_HOST = 'smtp.zoho.com';
const SMTP_PORT = 465; // SSL
const SMTP_USER = 'no-reply@46advance.com';
const ADMIN_URL = 'https://advancethat.web.app/admin';

export const notifyOnRegistration = onDocumentCreated(
  { document: 'users/{uid}', secrets: [SMTP_PASSWORD] },
  async (event) => {
    const data = event.data?.data();
    if (!data) return;
    const notice = buildRegistrationNotice(data, ADMIN_URL);
    if (!notice) return; // admin or already-approved — nothing to approve

    const to = NOTIFY_TO.value();
    const pass = SMTP_PASSWORD.value();
    if (!to || !pass) {
      logger.info('Registration notification skipped — recipient or SMTP password not configured.');
      return;
    }

    try {
      const transport = nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: true,
        auth: { user: SMTP_USER, pass },
      });
      await transport.sendMail({ from: `46 Advance <${SMTP_USER}>`, to, subject: notice.subject, text: notice.text });
      logger.info('Registration notification sent', { uid: event.params.uid, to });
    } catch (err) {
      logger.error('Registration notification failed', { uid: event.params.uid, error: String(err) });
    }
  },
);
