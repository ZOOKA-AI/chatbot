# ADMIN CONSOLE

19 صفحة تحت `/admin` + `/workspace/admin/{growth,n8n}`، ومسارات `/api/admin/{backup,growth,migrate,overview,users}`.

```mermaid
flowchart LR
  O["overview<br/>#197 تتابع · #198 مهلة"] --> U["users"]
  O --> W["workspaces #196"]
  O --> I["integrations"]
  O --> S["security / incidents"]
  O --> B["billing / referrals"]
  O --> A["agents / automation / command"]
  O --> D["deployments / development / system-map"]
  O --> R["reports / studios / browser"]
  ALL["كل إجراء"] --> L["(PlatformAuditLog)"]
```

## المطلوب
- كل رقم في اللوحة من استعلام حقيقي؛ أي قسم بلا مصدر بيانات يُعلَّم COMING SOON.
- أعلام الميزات وزر الإيقاف الطارئ مكانهما `/admin/security`.
- `/admin/deployments` يعتمد على Vercel API — يحتاج توكن صالح.
