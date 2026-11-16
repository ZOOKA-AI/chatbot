import { compare } from "bcrypt-ts";
import postgres from "postgres";
const sql = postgres("postgres://postgres@127.0.0.1:55432/zooka_ui", { max: 1, onnotice: () => {} });
const [row] = await sql`select email, password, "emailVerifiedAt" from "User" where lower(email)='owner@acceptance.local'`;
console.log("user:", row?.email, "verified:", row?.emailVerifiedAt ? "yes" : "no");
console.log("hash prefix:", String(row?.password).slice(0, 7), "len:", String(row?.password).length);
console.log("compare ok:", await compare("AcceptanceTest2026!", String(row?.password)));
await sql.end();
