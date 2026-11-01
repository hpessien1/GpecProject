import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2'
import type { EmailSettings } from '../config.js'

export interface EmailMessage {
  to: string[]
  subject: string
  // The plain-text copy, for mail apps that do not show designed emails.
  text: string
  // The designed version (services/emailLayout.ts).
  html?: string
  replyTo?: string
}

// Anything that can send an email. Production uses Amazon SES; tests pass a recorder instead.
export interface Mailer {
  send(message: EmailMessage): Promise<void>
}

// The only code that talks to Amazon SES. Nothing a customer typed is ever interpreted as HTML (the
// layout escapes it), and the subject never contains customer input (only server-made references).
export function sesMailer(settings: EmailSettings): Mailer {
  const client = new SESv2Client({
    region: settings.region,
    credentials: { accessKeyId: settings.accessKeyId, secretAccessKey: settings.secretAccessKey },
  })
  return {
    async send({ to, subject, text, html, replyTo }) {
      await client.send(new SendEmailCommand({
        FromEmailAddress: settings.from,
        Destination: { ToAddresses: to },
        ReplyToAddresses: replyTo ? [replyTo] : undefined,
        Content: { Simple: { Subject: { Data: subject, Charset: 'UTF-8' }, Body: { Text: { Data: text, Charset: 'UTF-8' }, ...(html ? { Html: { Data: html, Charset: 'UTF-8' } } : {}) } } },
      }))
    },
  }
}
