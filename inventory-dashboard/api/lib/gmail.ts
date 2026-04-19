import { google } from "googleapis";

function getAuth() {
  const auth = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET
  );
  auth.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
  return auth;
}

export interface EmailMessage {
  id: string;
  threadId: string;
  subject: string;
  body: string;
  date: Date;
}

export interface EmailAttachment {
  filename: string;
  mimeType: string;
  data: Buffer;
}

export interface EmailWithAttachments extends EmailMessage {
  attachments: EmailAttachment[];
}

/** Fetch unread emails from the supplier */
export async function fetchUnreadSupplierEmails(
  supplierEmail: string,
  maxResults = 20
): Promise<EmailMessage[]> {
  const auth = getAuth();
  const gmail = google.gmail({ version: "v1", auth });

  const res = await gmail.users.messages.list({
    userId: "me",
    q: `from:${supplierEmail} is:unread`,
    maxResults,
  });

  const messageIds = res.data.messages || [];
  if (messageIds.length === 0) return [];

  const emails: EmailMessage[] = [];

  for (const { id } of messageIds) {
    if (!id) continue;
    const msg = await gmail.users.messages.get({
      userId: "me",
      id,
      format: "full",
    });

    const headers = msg.data.payload?.headers || [];
    const subject =
      headers.find((h) => h.name?.toLowerCase() === "subject")?.value || "";
    const dateStr =
      headers.find((h) => h.name?.toLowerCase() === "date")?.value || "";

    const body = extractPlainText(msg.data.payload);

    emails.push({
      id: id,
      threadId: msg.data.threadId || "",
      subject,
      body,
      date: new Date(dateStr),
    });
  }

  return emails;
}

/** Mark an email as read */
export async function markAsRead(messageId: string): Promise<void> {
  const auth = getAuth();
  const gmail = google.gmail({ version: "v1", auth });

  await gmail.users.messages.modify({
    userId: "me",
    id: messageId,
    requestBody: { removeLabelIds: ["UNREAD"] },
  });
}

/** Fetch unread emails matching a query, including attachments */
export async function fetchUnreadEmailsWithAttachments(
  query: string,
  maxResults = 10
): Promise<EmailWithAttachments[]> {
  const auth = getAuth();
  const gmail = google.gmail({ version: "v1", auth });

  const res = await gmail.users.messages.list({
    userId: "me",
    q: query,
    maxResults,
  });

  const messageIds = res.data.messages || [];
  if (messageIds.length === 0) return [];

  const emails: EmailWithAttachments[] = [];

  for (const { id } of messageIds) {
    if (!id) continue;
    const msg = await gmail.users.messages.get({
      userId: "me",
      id,
      format: "full",
    });

    const headers = msg.data.payload?.headers || [];
    const subject =
      headers.find((h) => h.name?.toLowerCase() === "subject")?.value || "";
    const dateStr =
      headers.find((h) => h.name?.toLowerCase() === "date")?.value || "";

    const body = extractPlainText(msg.data.payload);
    const attachments = await extractAttachments(gmail, id, msg.data.payload);

    emails.push({
      id,
      threadId: msg.data.threadId || "",
      subject,
      body,
      date: new Date(dateStr),
      attachments,
    });
  }

  return emails;
}

/** Recursively extract attachments from Gmail message payload */
async function extractAttachments(
  gmail: any,
  messageId: string,
  payload: any
): Promise<EmailAttachment[]> {
  const attachments: EmailAttachment[] = [];
  if (!payload) return attachments;

  async function walk(part: any) {
    const filename = part.filename || "";
    const mimeType = part.mimeType || "";
    const body = part.body || {};

    if (filename && (body.attachmentId || body.data)) {
      let data: Buffer;
      if (body.attachmentId) {
        // Large attachment — fetch separately
        const att = await gmail.users.messages.attachments.get({
          userId: "me",
          messageId,
          id: body.attachmentId,
        });
        data = Buffer.from(att.data.data, "base64url");
      } else {
        data = Buffer.from(body.data, "base64url");
      }
      attachments.push({ filename, mimeType, data });
    }

    if (part.parts) {
      for (const sub of part.parts) {
        await walk(sub);
      }
    }
  }

  await walk(payload);
  return attachments;
}

// Cache resolved label IDs for the lifetime of the function invocation
const labelIdCache = new Map<string, string>();

/**
 * Apply a Gmail label to a message, creating the label if it doesn't exist.
 */
export async function applyLabel(
  messageId: string,
  labelName: string
): Promise<void> {
  const auth = getAuth();
  const gmail = google.gmail({ version: "v1", auth });

  let labelId = labelIdCache.get(labelName);
  if (!labelId) {
    const list = await gmail.users.labels.list({ userId: "me" });
    const found = (list.data.labels || []).find((l) => l.name === labelName);
    if (found?.id) {
      labelId = found.id;
    } else {
      const created = await gmail.users.labels.create({
        userId: "me",
        requestBody: {
          name: labelName,
          labelListVisibility: "labelShow",
          messageListVisibility: "show",
        },
      });
      if (!created.data.id) throw new Error(`Failed to create label ${labelName}`);
      labelId = created.data.id;
    }
    labelIdCache.set(labelName, labelId);
  }

  await gmail.users.messages.modify({
    userId: "me",
    id: messageId,
    requestBody: { addLabelIds: [labelId] },
  });
}

/** Extract plain text body from Gmail message payload */
function extractPlainText(payload: any): string {
  if (!payload) return "";

  // Direct body
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return Buffer.from(payload.body.data, "base64").toString("utf-8");
  }

  // Multipart — recurse
  if (payload.parts) {
    for (const part of payload.parts) {
      const text = extractPlainText(part);
      if (text) return text;
    }
  }

  // Fallback: decode whatever body is there
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, "base64").toString("utf-8");
  }

  return "";
}
