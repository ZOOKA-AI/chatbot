# DEVELOPER PLATFORM

| العنصر | الكود | الحالة |
| --- | --- | --- |
| MCP server | `app/api/mcp/route.ts`, `lib/mcp/server.ts`, `catalog.ts` | موجود |
| مفاتيح API | `app/api/mcp/keys/route.ts`, جدول `mcp_api_key`, `/settings/mcp` | موجود |
| بوابة المطورين | `/developer` | موجود |
| Webhooks واردة | `/api/webhooks/{n8n,stripe,whatsapp}` + `WebhookEvent` | موجود |
| Embed | `/embed` | موجود |
| OpenAPI | — | غير موجود |
| Rate limit لكل مفتاح | — | غير موثّق (يوجد throttle للمصادقة والبريد فقط) |

```mermaid
sequenceDiagram
  participant Dev as مطوّر
  participant K as /settings/mcp
  participant MCP as /api/mcp
  Dev->>K: إنشاء مفتاح (يظهر مرة واحدة)
  Dev->>MCP: JSON-RPC + Bearer
  MCP->>MCP: تحقق المفتاح + workspace
  MCP-->>Dev: tools/list, tools/call
```
