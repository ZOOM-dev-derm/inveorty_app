import http from "node:http";
import { google } from "googleapis";

const CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const PORT = 8091;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Usage: GMAIL_CLIENT_ID=xxx GMAIL_CLIENT_SECRET=xxx node get-gmail-token.mjs");
  process.exit(1);
}

const oauth2 = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, `http://localhost:${PORT}`);

const authUrl = oauth2.generateAuthUrl({
  access_type: "offline",
  scope: [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.modify",
  ],
  prompt: "consent",
});

const server = http.createServer(async (req, res) => {
  const code = new URL(req.url, `http://localhost:${PORT}`).searchParams.get("code");
  if (!code) { res.writeHead(400); res.end("No code"); return; }

  try {
    const { tokens } = await oauth2.getToken(code);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end("<h1>Done! You can close this tab.</h1>");
    console.log("\n=== REFRESH TOKEN ===");
    console.log(tokens.refresh_token);
    console.log("=====================\n");
  } catch (err) {
    res.writeHead(500);
    res.end("Error: " + err.message);
    console.error(err);
  }
  server.close();
});

server.listen(PORT, () => {
  console.log("Open this URL in an incognito window (sign in as logistics@dermalosophy.co.il):\n");
  console.log(authUrl + "\n");
});
