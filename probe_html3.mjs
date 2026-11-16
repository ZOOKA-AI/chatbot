import { chromium } from "playwright";
const B="https://localhost:3444",E="rc-b-mwjc8sws@zooka-test.dev",P="Rc-Accept-2026!x7Qm";
const b=await chromium.launch({args:["--no-sandbox"]});const c=await b.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:900}});
const csrf=(await(await c.request.get(B+"/api/auth/csrf")).json()).csrfToken;
await c.request.post(B+"/api/auth/callback/credentials",{form:{csrfToken:csrf,email:E,password:P,callbackUrl:B+"/"}});
for (const p of ["/login","/workspace"]) {
 const page=await c.newPage(); await page.goto(B+p,{waitUntil:"domcontentloaded"}); await page.waitForTimeout(1200);
 const out=await page.evaluate(()=>[...document.querySelectorAll("button")]
  .filter(el=>el.offsetParent!==null)
  .filter(el=>!(el.getAttribute("aria-label")||el.textContent||"").trim())
  .map(el=>({cls:el.className.slice(0,60), parent:el.parentElement?.tagName+"."+(el.parentElement?.className||"").slice(0,60), svg:el.querySelector("svg")?.outerHTML.slice(0,90)})));
 console.log(p, JSON.stringify(out,null,1).slice(0,1000));
 await page.close();
}
await b.close();
