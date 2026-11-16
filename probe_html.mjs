import { chromium } from "playwright";
const B="https://localhost:3444",E="rc-b-mwjc8sws@zooka-test.dev",P="Rc-Accept-2026!x7Qm";
const b=await chromium.launch({args:["--no-sandbox"]});const c=await b.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:900}});
const csrf=(await(await c.request.get(B+"/api/auth/csrf")).json()).csrfToken;
await c.request.post(B+"/api/auth/callback/credentials",{form:{csrfToken:csrf,email:E,password:P,callbackUrl:B+"/"}});
const page=await c.newPage(); await page.goto(B+"/workspace",{waitUntil:"domcontentloaded"}); await page.waitForTimeout(600);
const info=await page.evaluate(()=>[...document.querySelectorAll("button")]
  .filter(el=>el.offsetParent!==null)
  .filter(el=>!(el.getAttribute("aria-label")||el.textContent||"").trim())
  .map(el=>({html:el.outerHTML.slice(0,400), svg:el.querySelector("svg")?true:false})));
console.log(JSON.stringify(info,null,1).slice(0,1400));
await b.close();
