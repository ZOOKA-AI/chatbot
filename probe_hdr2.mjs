import { chromium } from "playwright";
const B="https://localhost:3444",E="rc-b-mwjc8sws@zooka-test.dev",P="Rc-Accept-2026!x7Qm";
const b=await chromium.launch({args:["--no-sandbox"]});const c=await b.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:900}});
const csrf=(await(await c.request.get(B+"/api/auth/csrf")).json()).csrfToken;
await c.request.post(B+"/api/auth/callback/credentials",{form:{csrfToken:csrf,email:E,password:P,callbackUrl:B+"/"}});
await c.addCookies([{name:"zooka_lang",value:"en",url:B,secure:true,sameSite:"Lax"}]);
const page=await c.newPage(); await page.goto(B+"/login",{waitUntil:"domcontentloaded"}); await page.waitForTimeout(1200);
const out=await page.evaluate(()=>[...document.querySelectorAll("a,button")]
 .filter(e=>e.offsetParent!==null)
 .filter(e=>!(e.getAttribute("aria-label")||e.textContent||e.getAttribute("title")||"").trim())
 .map(e=>({html:e.outerHTML.replace(/\s+/g," ").slice(260,600)})));
console.log(JSON.stringify(out,null,1));
await b.close();
