/* Zooka AI chat widget v1 — embed on any site:
   <script src="https://zooka-ai.com/embed.js"
     data-title="تحدث معنا"
     data-color="#2563eb"
     data-position="left|right" async></script>
*/
(function () {
  "use strict";
  if (window.__zookaWidget) return;
  window.__zookaWidget = true;

  var current =
    document.currentScript ||
    (function () {
      var s = document.getElementsByTagName("script");
      return s[s.length - 1];
    })();

  var appUrl = (current && current.getAttribute("data-app-url")) || "https://zooka-ai.com";
  if (appUrl.charAt(appUrl.length - 1) === "/") {
    appUrl = appUrl.slice(0, -1);
  }
  var title = (current && current.getAttribute("data-title")) || "تحدث مع المساعد الذكي";
  var color = (current && current.getAttribute("data-color")) || "#2563eb";
  var side = (current && current.getAttribute("data-position")) === "left" ? "left" : "right";

  var style = document.createElement("style");
  style.textContent = [
    ".zooka-bubble{position:fixed;bottom:20px;z-index:99999;display:flex;align-items:center;gap:8px;",
    "padding:12px 18px;border:none;border-radius:999px;background:" + color + ";color:#fff;font:600 15px/1 system-ui,-apple-system,'Segoe UI',sans-serif;",
    "cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.25);transition:transform .15s ease,box-shadow .15s ease}",
    ".zooka-bubble:hover{transform:translateY(-2px);box-shadow:0 6px 20px rgba(0,0,0,.3)}",
    ".zooka-bubble svg{width:20px;height:20px;flex:none}",
    ".zooka-bubble.is-left{left:20px}.zooka-bubble.is-right{right:20px}"
  ].join("");
  document.head.appendChild(style);

  var button = document.createElement("button");
  button.className = "zooka-bubble " + (side === "left" ? "is-left" : "is-right");
  button.type = "button";
  button.setAttribute("aria-label", title);
  button.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' +
    "<span></span>";
  button.querySelector("span").textContent = title;

  var popup = null;
  button.addEventListener("click", function () {
    if (popup && !popup.closed) {
      popup.focus();
      return;
    }
    var width = 430;
    var height = Math.min(780, window.screen.height * 0.85);
    var left = side === "left" ? 24 : window.screen.width - width - 24;
    popup = window.open(
      appUrl + "/embed",
      "zooka_chat",
      "popup=yes,width=" + width + ",height=" + height + ",left=" + left + ",top=60"
    );
  });

  function mount() {
    document.body.appendChild(button);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
