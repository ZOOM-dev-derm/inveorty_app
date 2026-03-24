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
