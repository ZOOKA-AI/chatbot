// A controlled site for browser acceptance: a form, a button, a dropdown, a second page.
// Deliberately plain HTML so a failure here is the browser's, not a framework's.
import { createServer } from "node:http";

const page = (body, title) => `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${title}</title></head>
<body style="font-family:sans-serif;padding:24px"><h1 id="title">${title}</h1>${body}</body></html>`;

const routes = {
  "/": page(
    `<form id="form" onsubmit="event.preventDefault();document.getElementById('result').textContent='submitted:'+document.getElementById('name').value">
       <input id="name" name="name" aria-label="الاسم" />
       <select id="city" aria-label="المدينة"><option value="dxb">دبي</option><option value="auh">أبوظبي</option></select>
       <button id="go" type="submit">إرسال</button>
     </form>
     <p id="result">—</p>
     <a id="next" href="/second">الصفحة الثانية</a>
     <div style="height:2000px"></div><p id="bottom">أسفل الصفحة</p>`,
    "صفحة الاختبار"
  ),
  "/second": page(`<p id="done">وصلت إلى الصفحة الثانية</p><a id="back" href="/">رجوع</a>`, "الصفحة الثانية"),
};

export function startTestSite(port = 4517) {
  const server = createServer((request, response) => {
    const body = routes[request.url ?? "/"] ?? routes["/"];
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(body);
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}

if (process.argv[1]?.endsWith("browser-test-site.mjs")) {
  await startTestSite(Number(process.env.PORT ?? 4517));
  console.log("test site listening on 4517");
}
