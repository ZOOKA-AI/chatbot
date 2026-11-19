import { chromium } from "playwright";
const B="https://localhost:3444",E="rc-b-mwjc8sws@zooka-test.dev",P="Rc-Accept-2026!x7Qm";
const b=await chromium.launch({args:["--no-sandbox"]});const c=await b.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:900}});
const csrf=(await(await c.request.get(B+"/api/auth/csrf")).json()).csrfToken;
await c.request.post(B+"/api/auth/callback/credentials",{form:{csrfToken:csrf,email:E,password:P,callbackUrl:B+"/"}});
for (const p of ["/workspace"]) {
 const page=await c.newPage(); await page.goto(B+p,{waitUntil:"domcontentloaded"}); await page.waitForTimeout(900);
 const out=await page.evaluate(()=>[...document.querySelectorAll("a,button")]
   .filter(el=>el.offsetParent!==null)
   .filter(el=>!(el.getAttribute("aria-label")||el.textContent||"").trim())
   .map(el=>({tag:el.tagName, attrs:[...el.attributes].map(a=>a.name).join(","),
     svg:el.querySelector("svg")?.getAttribute("viewBox"),
     parentChain:[el.parentElement?.tagName, el.parentElement?.parentElement?.tagName, el.parentElement?.parentElement?.parentElement?.className?.slice(0,50)].join(" < ")})));
 console.log(p, JSON.stringify(out,null,1).slice(0,900));
 await page.close();
}
await b.close();
