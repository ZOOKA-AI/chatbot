/**
 * Mints a real session cookie for the acceptance run.
 *
 * The cookie is produced by the same library and signed with the same secret this deployment
 * validates, so the pages verify it exactly as they verify a browser's. This is how the run
 * gets a signed-in customer without depending on the login form, which is exercised separately.
 */
import { encode } from "next-auth/jwt";

const secret = process.env.AUTH_SECRET;
if (!secret) throw new Error("AUTH_SECRET is required");

// The app's jwt callback resolves the workspace from token.id, and Auth.js only maps `sub`
// into `sub`. Both are set so the session carries the same shape a real login produces.
const token = {
  id: process.env.ACCEPT_USER_ID,
  sub: process.env.ACCEPT_USER_ID,
  email: process.env.ACCEPT_EMAIL,
  name: "Acceptance Owner",
  type: "regular",
};

const value = await encode({ token, secret, salt: "authjs.session-token" });
process.stdout.write(value);
