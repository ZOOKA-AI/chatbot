# INFORMATION ARCHITECTURE

مستخرج من `find app -name page.tsx` (80 صفحة) ومن `components/app-sidebar.tsx`.

```mermaid
flowchart TD
  Root["/"] --> Mk["التسويق: about, pricing, blog, compare, partners, lp/*, legal"]
  Root --> Auth["(auth): login, register, forgot/reset-password"]
  Root --> Chat["/chat/:id"]
  Root --> WS["/workspace"]
  Root --> ST["/studio, /dashboard/studio"]
  Root --> SET["/settings: account, integrations, leads, mcp, usage"]
  Root --> DEV["/developer"]
  Root --> ADM["/admin"]
  WS --> WS1["home, agents, agent, commander, actions, schedules, automations"]
  WS --> WS2["projects, documents, mail, browser, live-browser"]
  WS --> WS3["integrations, integrations/tiktok, base44"]
  WS --> WS4["billing, usage, rewards, security, launch"]
  WS --> WS5["admin/growth, admin/n8n"]
  ADM --> AD["agents, automation, billing, browser, command, deployments, development, incidents, integrations, referrals, reports, security, studios, system-map, users, workspaces"]
```

## ملاحظات
- تداخل: `/workspace/agent` و`/workspace/agents` و`/workspace/commander`؛ و`/studio` و`/dashboard/studio` و`/workspace/studio`. يحتاج قرار دمج (لا حذف بدون موافقة).
- `/privacy` و`/privacy-policy` كلاهما موجود.
- `/social` غير موجود في `main` (Draft #191).
