import type { VercelRequest, VercelResponse } from "@vercel/node";
import { processComaxEmails } from "../lib/comax-processor.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const result = await processComaxEmails();
    if (result.processed === 0) {
      return res.status(200).json({
        message: "No unprocessed Comax emails in the last 7 days",
        ...result,
      });
    }
    return res.status(200).json({
      message: `Processed ${result.processed} email(s), ${result.items} items updated, ${result.newProducts} new product(s) added`,
      ...result,
    });
  } catch (err) {
    console.error("Poll Comax report failed:", err);
    return res.status(500).json({ error: String(err) });
  }
}
