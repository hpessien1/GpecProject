import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2'
import type { EmailSettings } from '../config.js'

export interface EmailMessage {
  to: string[]
  subject: string
  text: string
  replyTo?: string
}

// Anything that can send an email. Production uses Amazon SES; tests pass a recorder instead.
export interface Mailer {
  send(message: EmailMessage): Promise<void>
}

// The only code that talks to Amazon SES. Plain-text emails only: nothing a customer typed is ever
// interpreted as HTML, and the subject never contains customer input (only server-made references).
export function sesMailer(settings: EmailSettings): Mailer {
  const client = new SESv2Client({
    region: settings.region,
    credentials: { accessKeyId: settings.accessKeyId, secretAccessKey: settings.secretAccessKey },
  })
  return {
    async send({ to, subject, text, replyTo }) {
      await client.send(new SendEmailCommand({
        FromEmailAddress: settings.from,
        Destination: { ToAddresses: to },
        ReplyToAddresses: replyTo ? [replyTo] : undefined,
        Content: { Simple: { Subject: { Data: subject, Charset: 'UTF-8' }, Body: { Text: { Data: text, Charset: 'UTF-8' } } } },
      }))
    },
  }
}
