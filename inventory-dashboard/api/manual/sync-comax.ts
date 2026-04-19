import type { VercelRequest, VercelResponse } from "@vercel/node";
import { processComaxEmails } from "../lib/comax-processor.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Manual-Sync-Token");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const token = req.headers["x-manual-sync-token"];
  const expected = process.env.MANUAL_SYNC_TOKEN;
  if (!expected) return res.status(500).json({ error: "MANUAL_SYNC_TOKEN not configured" });
  if (token !== expected) return res.status(401).json({ error: "Unauthorized" });

  try {
    const result = await processComaxEmails();
    return res.status(200).json({
      message:
        result.processed === 0
          ? "אין מיילים חדשים מ-Comax לעיבוד"
          : `עודכנו ${result.items} פריטים מ-${result.processed} מיילים`,
      ...result,
    });
  } catch (err) {
    console.error("Manual sync failed:", err);
    return res.status(500).json({ error: String(err) });
  }
}
