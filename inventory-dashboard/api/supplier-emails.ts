import type { VercelRequest, VercelResponse } from "@vercel/node";
import { google } from "googleapis";

const SUPPLIER_EMAIL = "operating2@peerpharm.com";

function getAuth() {
  const auth = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET
  );
  auth.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
  return auth;
}

function extractPlainText(payload: any): string {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return Buffer.from(payload.body.data, "base64").toString("utf-8");
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      const text = extractPlainText(part);
      if (text) return text;
    }
  }
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, "base64").toString("utf-8");
  }
  return "";
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const auth = getAuth();
    const gmail = google.gmail({ version: "v1", auth });

    // Fetch emails both from and to the supplier
    const listRes = await gmail.users.messages.list({
      userId: "me",
      q: `{from:${SUPPLIER_EMAIL} to:${SUPPLIER_EMAIL}}`,
      maxResults: 50,
    });

    const messageIds = listRes.data.messages || [];
    if (messageIds.length === 0) {
      return res.status(200).json([]);
    }

    const emails = [];

    for (const { id } of messageIds) {
      if (!id) continue;
      const msg = await gmail.users.messages.get({
        userId: "me",
        id,
        format: "full",
      });

      const headers = msg.data.payload?.headers || [];
      const subject = headers.find((h) => h.name?.toLowerCase() === "subject")?.value || "";
      const fromHeader = headers.find((h) => h.name?.toLowerCase() === "from")?.value || "";
      const dateStr = headers.find((h) => h.name?.toLowerCase() === "date")?.value || "";

      const isIncoming = fromHeader.toLowerCase().includes(SUPPLIER_EMAIL.toLowerCase());
      const body = extractPlainText(msg.data.payload);

      // Extract order tag [DL-{sku}--{date}] from subject
      const tagMatch = subject.match(/\[DL-([^\]]+?)--([^\]]+?)\]/);
      const orderTag = tagMatch ? tagMatch[0] : null;

      emails.push({
        id,
        threadId: msg.data.threadId || "",
        subject,
        date: dateStr ? new Date(dateStr).toISOString() : "",
        direction: isIncoming ? "incoming" : "outgoing",
        body: body.slice(0, 500),
        orderTag,
      });
    }

    // Sort newest first
    emails.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
    return res.status(200).json(emails);
  } catch (err: any) {
    console.error("Failed to fetch supplier emails:", err);
    return res.status(500).json({ error: err.message });
  }
}
