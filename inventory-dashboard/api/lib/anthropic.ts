import type { LlmExtractedItem } from "./types.js";

const MODEL = "claude-haiku-4-5-20251001";

async function callClaude(prompt: string, maxTokens: number): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const json = await res.json();
  return json.content?.[0]?.text || "";
}

/**
 * For tagged emails — returns a concise Hebrew summary (max 100 chars).
 */
export async function callLlmPlainText(
  emailBody: string,
  subject: string
): Promise<string> {
  const prompt =
    "You are an assistant that extracts order status information from supplier email replies.\n" +
    'The supplier is פאר פארם (Peer Pharm). Their contact is Firas (פיראס) at operating2@peerpharm.com.\n' +
    "Emails are in Hebrew. Extract the key status update per product/SKU mentioned.\n\n" +
    "Common status keywords from this supplier:\n" +
    "- סופק = supplied/delivered\n" +
    "- בעבודה = in production\n" +
    "- תוקן = fixed/corrected\n" +
    "- בוצע מיון = sorting completed\n" +
    "- נמתין לקבלת = waiting to receive (components/labels)\n" +
    "- נייצר = will produce\n" +
    "- קיבלתי והכנסתי את ההזמנה = order received and entered\n" +
    "- הכל טופל = everything handled\n\n" +
    'Return ONLY a concise Hebrew summary (max 100 chars). Include SKU numbers if mentioned.\n' +
    'Examples: "סופק", "בעבודה, צפי שבוע הבא", "קיבלתי ההזמנה", "סופק 2338 יח, 316 לתיקון".\n\n' +
    "Subject: " + subject + "\n\nEmail body:\n" + emailBody;

  const result = await callClaude(prompt, 150);
  return result.trim().substring(0, 100);
}

/**
 * For untagged emails — returns structured SKU-level data.
 */
export async function callLlmStructured(
  emailBody: string,
  subject: string
): Promise<LlmExtractedItem[]> {
  const today = new Date();
  const todayStr = today.toLocaleDateString("en-GB", { timeZone: "Asia/Jerusalem" }).replace(/\//g, "/");

  const prompt =
    'You parse supplier emails from פאר פארם about cosmetics orders.\n' +
    "Extract every product SKU mentioned with its status.\n" +
    "Return ONLY a JSON array (no markdown, no explanation).\n" +
    "Today's date: " + todayStr + "\n\n" +
    'Each item: {"sku":"string","status":"string","quantity":number|null,"expectedDate":"DD/MM/YYYY"|null,"confirmed":boolean}\n\n' +
    "Rules:\n" +
    "- sku = numeric product code (the supplier's SKU number)\n" +
    "- status = concise Hebrew: סופק/בעבודה/נייצר/תוקן/ממתין etc.\n" +
    "- quantity = number if explicitly stated, null otherwise\n" +
    "- expectedDate = resolve relative dates (שבוע הבא → +7d, שבועיים → +14d) to DD/MM/YYYY. null if none.\n" +
    "- confirmed = true only if explicitly confirms order receipt (קיבלתי/אושר/מאשר)\n\n" +
    "If the email has no order/production info, return [].\n\n" +
    "Subject: " + subject + "\n\nEmail body:\n" + emailBody;

  const raw = await callClaude(prompt, 2000);
  const cleaned = raw.replace(/```(?:json)?\s*/g, "").replace(/```\s*/g, "").trim();

  try {
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    console.error("callLlmStructured: JSON parse failed:", cleaned);
    return [];
  }
}
