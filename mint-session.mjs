import { encode } from "@auth/core/jwt";
import { readFileSync } from "node:fs";
const env = readFileSync(".env.local","utf8");
const secret = /^AUTH_SECRET=(.*)$/m.exec(env)[1].trim().replace(/^"|"$/g,"");
const token = await encode({
  token: { sub: "aad414a8-46a5-4d40-b83c-c569daca8b7c", name: "Helmy", email: "helmyharoon8@gmail.com", type: "regular" },
  secret,
  salt: "__Secure-authjs.session-token",
  maxAge: 3600,
});
console.log(token);
