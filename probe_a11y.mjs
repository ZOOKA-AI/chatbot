import { chromium } from "playwright";
const B="https://localhost:3444",E="rc-b-mwjc8sws@zooka-test.dev",P="Rc-Accept-2026!x7Qm";
const b=await chromium.launch({args:["--no-sandbox"]});const c=await b.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:900}});
const csrf=(await(await c.request.get(B+"/api/auth/csrf")).json()).csrfToken;
await c.request.post(B+"/api/auth/callback/credentials",{form:{csrfToken:csrf,email:E,password:P,callbackUrl:B+"/"}});
for (const p of ["/login","/workspace","/pricing"]) {
  const page=await c.newPage(); await page.goto(B+p,{waitUntil:"domcontentloaded"}); await page.waitForTimeout(600);
  const bad=await page.evaluate(()=>[...document.querySelectorAll("a,button")]
    .filter(el=>el.offsetParent!==null)
    .filter(el=>!(el.getAttribute("aria-label")||el.textContent||el.getAttribute("title")||"").trim())
    .map(el=>el.outerHTML.slice(0,140)));
  console.log(p, "->", JSON.stringify(bad,null,1).slice(0,600));
  await page.close();
}
await b.close();
