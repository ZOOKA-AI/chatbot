# USER JOURNEYS

الرحلات مبنية على المسارات الموجودة فعلًا في `app/`.

## زائر → مستخدم نشط
```mermaid
journey
  title من الزيارة إلى أول مهمة وكيل
  section اكتشاف
    / أو /ar أو /lp/*: 4: زائر
    /pricing: 3: زائر
  section تسجيل
    /register (Google, Facebook, بريد, OTP هاتف): 4: زائر
    guest بلا حساب (GuestUsage): 3: زائر
  section تفعيل
    /workspace/home: 4: مستخدم
    /settings/integrations ربط مزود: 2: مستخدم
  section قيمة
    /workspace/agents إنشاء مهمة: 3: مستخدم
    موافقة AgentApproval: 4: مستخدم
    /workspace/usage و /workspace/billing: 3: مستخدم
```
الفجوة: لا onboarding موجّه بعد التسجيل (`onboarding` يظهر فقط في الصفحة التسويقية و`integration-setup`).

## مهمة وكيل بموافقة
```mermaid
sequenceDiagram
  actor U as المستخدم
  participant W as /workspace/agents
  participant API as /api/agents/tasks
  participant Wk as lib/agents/worker.ts
  participant Ap as AgentApproval
  U->>W: يصف المهمة
  W->>API: POST task
  API->>Wk: lease (worker-lease.ts)
  Wk->>Ap: عملية كتابة/إنفاق؟ اطلب موافقة
  Ap-->>U: إشعار في /workspace/actions
  U->>Ap: موافقة
  Ap->>Wk: استكمال
  Wk-->>W: AgentExecution + AgentMessage
```

## مالك المنصة
`/admin` → overview (#197/#198) → users/workspaces (#196) → integrations/security/incidents → `/workspace/admin/growth` (قياس القنوات #204).
