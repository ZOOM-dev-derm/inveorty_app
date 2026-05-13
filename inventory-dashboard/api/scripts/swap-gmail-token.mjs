// Interactive one-shot: regenerate GMAIL_REFRESH_TOKEN against amit.b@ Gmail.
// Usage: node api/scripts/swap-gmail-token.mjs
//   (Requires .env.production with GMAIL_CLIENT_ID + GMAIL_CLIENT_SECRET)
//
// What it does:
//   1. Starts a local HTTP server on http://localhost:53682/callback
//   2. Generates a Google OAuth consent URL with gmail.modify scope
//   3. Prints the URL — user opens in a browser, signs in as amit.b@, grants
//   4. Browser redirects back to localhost; this script captures the code
//   5. Exchanges code for refresh_token, prints it
//   6. Writes new token to .env.production (for Vercel push step that follows)
import http from "node:http";
import { URL } from "node:url";
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { google } from "googleapis";

const ENV_PATH = path.resolve(process.cwd(), ".env.production");
dotenv.config({ path: ENV_PATH });

const CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Missing GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET in .env.production");
  process.exit(1);
}

const PORT = 53682;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;

const oauth2 = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
const authUrl = oauth2.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: ["https://www.googleapis.com/auth/gmail.modify"],
});

console.log("=== Step 1: open this URL in a browser ===\n");
console.log(authUrl);
console.log("\n=== Step 2: sign in as amit.b@dermalosophy.co.il, click Continue/Allow ===");
console.log("=== Step 3: browser redirects to localhost — leave it; this script captures the code ===\n");

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    if (url.pathname !== "/callback") {
      res.writeHead(404).end("Not Found");
      return;
    }
    const code = url.searchParams.get("code");
    const err = url.searchParams.get("error");
    if (err) {
      res.writeHead(400, { "Content-Type": "text/plain" }).end(`OAuth error: ${err}`);
      console.error(`OAuth error: ${err}`);
      server.close();
      process.exit(1);
    }
    if (!code) {
      res.writeHead(400, { "Content-Type": "text/plain" }).end("No code in callback");
      return;
    }

    const { tokens } = await oauth2.getToken(code);
    if (!tokens.refresh_token) {
      res.writeHead(500, { "Content-Type": "text/plain" })
        .end("No refresh_token returned. Revoke prior consent at https://myaccount.google.com/permissions and retry.");
      console.error("No refresh_token in response. Tokens:", tokens);
      server.close();
      process.exit(1);
    }

    // Verify the account we just auth'd
    oauth2.setCredentials(tokens);
    const gmail = google.gmail({ version: "v1", auth: oauth2 });
    const profile = await gmail.users.getProfile({ userId: "me" });
    const email = profile.data.emailAddress;

    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(
      `<html><body style="font-family:sans-serif"><h2>✓ Token captured for ${email}</h2><p>You can close this tab.</p></body></html>`
    );

    console.log(`\n=== Captured refresh_token for: ${email} ===`);
    if (email !== "amit.b@dermalosophy.co.il") {
      console.warn(`⚠ Expected amit.b@dermalosophy.co.il but got ${email}. Token NOT written. Retry signed in as Amit.`);
      server.close();
      process.exit(1);
    }

    // Replace GMAIL_REFRESH_TOKEN in .env.production
    const envText = fs.readFileSync(ENV_PATH, "utf8");
    const newLine = `GMAIL_REFRESH_TOKEN="${tokens.refresh_token}"`;
    let next;
    if (/^GMAIL_REFRESH_TOKEN=/m.test(envText)) {
      next = envText.replace(/^GMAIL_REFRESH_TOKEN=.*$/m, newLine);
    } else {
      next = envText.trimEnd() + "\n" + newLine + "\n";
    }
    fs.writeFileSync(ENV_PATH, next);
    console.log(`✓ Wrote refresh_token to ${ENV_PATH}`);
    console.log("Done. Next: push token to Vercel env + redeploy.");
    server.close();
    process.exit(0);
  } catch (e) {
    console.error("Callback handler failed:", e.message);
    res.writeHead(500).end(String(e.message));
    server.close();
    process.exit(1);
  }
});

server.listen(PORT, () => {
  console.log(`Listening on http://localhost:${PORT}/callback ...`);
});
