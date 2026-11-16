import { decode } from "next-auth/jwt";
import { readFileSync } from "node:fs";
const token = readFileSync("/tmp/session.jwt", "utf8").trim();
const secret = process.env.AUTH_SECRET;
console.log("secret length:", secret ? secret.length : "MISSING");
for (const salt of ["authjs.session-token", "__Secure-authjs.session-token"]) {
  try {
    const payload = await decode({ token, secret, salt });
    console.log("decoded with", salt, "→", JSON.stringify(payload).slice(0, 140));
  } catch (e) {
    console.log("failed", salt, "→", String(e).slice(0, 80));
  }
}
