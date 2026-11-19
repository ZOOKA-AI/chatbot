/**
 * HTTPS terminator for the acceptance run.
 *
 * Production serves the app over https, so Auth.js issues `__Secure-` prefixed cookies there.
 * A browser refuses those from a plain http origin, which is why a login attempted against
 * http://localhost produced no session even though the credentials were correct. Terminating
 * TLS here makes the local runtime match production's cookie policy exactly: the app itself is
 * unchanged, and the login is the real one a customer performs.
 */
import { createServer } from "node:https";
import { request } from "node:http";
import { readFileSync } from "node:fs";

const TARGET = Number(process.env.TARGET_PORT || 3005);
const PORT = Number(process.env.PORT || 3443);

const server = createServer(
  { key: readFileSync(process.env.TLS_KEY), cert: readFileSync(process.env.TLS_CERT) },
  (incoming, response) => {
    const proxied = request(
      {
        host: "127.0.0.1",
        port: TARGET,
        path: incoming.url,
        method: incoming.method,
        // The Host header must stay the one the browser used. Rewriting it to the upstream port
        // makes Next.js compare a mismatched Origin and reject the request with
        // "Invalid Server Actions request", which looks exactly like a broken login.
        headers: {
          ...incoming.headers,
          host: incoming.headers.host,
          "x-forwarded-host": incoming.headers.host,
          "x-forwarded-proto": "https",
        },
      },
      (upstream) => {
        response.writeHead(upstream.statusCode || 502, upstream.headers);
        upstream.pipe(response);
      }
    );
    proxied.on("error", () => {
      response.writeHead(502, { "content-type": "text/plain" });
      response.end("upstream unavailable");
    });
    incoming.pipe(proxied);
  }
);

server.listen(PORT, "127.0.0.1", () => console.log(`https listening on ${PORT} → http ${TARGET}`));
