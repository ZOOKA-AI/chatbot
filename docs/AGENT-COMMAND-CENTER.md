# ZOOKA AGENT COMMAND CENTER

غرفة التنسيق المشتركة لكل وكيل يعمل على المشروع. الفكرة العملية: الوكلاء لا يتحدثون مع بعضهم، بل يقرأون ويكتبون الحالة المشتركة هنا. GitHub يبقى مصدر الحقيقة للكود، وهذه الطبقة مصدر الحقيقة للمهام والقرارات.

## الهوية والمفاتيح

- كل وكيل له صف في `AgentIdentity` ومفتاح خاص يبدأ بـ`zk_`.
- القاعدة تخزّن `sha256(key)` فقط، والمفتاح يظهر **مرة واحدة** عند التسجيل.
- لا يوجد مفتاح مشترك بين وكيلين، ولا مفتاح مشترك بين بيئتي Production وPreview.
- طلب أي واجهة يمرّ بـ`Authorization: Bearer <agent key>`، والوكيل يجب أن يكون `status = active`.
- التسجيل وإنشاء المهام يحتاجان جلسة مالك أو أدمن، لا مفتاح وكيل.

## الصلاحيات (scopes)

| scope | يسمح بـ |
|---|---|
| `task:read` | قراءة قائمة المهام |
| `task:claim` | حجز مهمة |
| `task:report` | تسليم نتيجة أو فشل أو تعطّل |
| `decision:write` | تسجيل قرار |
| `approval:request` | طلب موافقة المالك |
| `deployment:write` | تسجيل عملية نشر |
| `heartbeat` | إثبات الحياة |

## الواجهات

| المسار | الطريقة | الوظيفة |
|---|---|---|
| `/api/agents/registry` | GET | قائمة الوكلاء بدون مفاتيح |
| `/api/agents/registry` | POST | تسجيل وكيل (مالك/أدمن) وإرجاع المفتاح مرة واحدة |
| `/api/agents/status` | GET | عدّادات المهام، الوكلاء الأحياء، الموافقات المعلّقة |
| `/api/agents/heartbeat` | POST | تحديث `lastSeenAt` |
| `/api/agents/tasks` | GET | المهام، مع `?status=` و`?available=true` |
| `/api/agents/tasks` | POST | إنشاء مهمة (مالك/أدمن) |
| `/api/agents/tasks/claim` | POST | حجز مهمة ذرّيًا |
| `/api/agents/tasks/report` | POST | تسليم النتيجة مع الدليل |
| `/api/agents/decisions` | GET/POST | سجل القرارات |
| `/api/agents/approvals/request` | POST | طلب موافقة |
| `/api/agents/deployments` | GET/POST | سجل النشر والتراجع |

## منع التنفيذ المزدوج

`POST /api/agents/tasks/claim` هو `UPDATE … WHERE id = $1 AND status = 'pending' AND (ownerAgentId IS NULL OR ownerAgentId = $caller)` بـ`RETURNING`. أي وكيل ثانٍ يصل بعد الأول يحصل على `409 task_already_claimed` مع اسم صاحب المهمة. لا يوجد أي مسار آخر يغيّر `status` من `pending` إلى `in_progress`.

## دورة حياة المهمة

```
pending → in_progress (claim) → completed | failed | blocked (report)
```

`report` مسموح فقط للوكيل الذي يملك المهمة، وممنوع على غيره (`403 task_not_owned_by_caller`).

## قواعد التعاون المطبقة

- مهمة واحدة = مالك واحد في وقت واحد.
- `approvalRequired` على المهمة يعني أن الوكيل يطلب موافقة قبل أي أثر خارجي.
- `rollbackPlan` حقل إلزامي عمليًا لأي مهمة نشر.
- الوكيل الذي يفقد الاتصال يوقف الكتابة الحساسة ويسلّم تقريرًا مستقلًا، لأن هذه الطبقة هي مصدر الحالة الوحيد.

## ما لا يُخزَّن هنا

لا محادثات، لا كلمات مرور، لا توكنات. الأعمدة نصية عناوين ونصوص إدارية فقط. أي سر يبقى في متغيّرات بيئة البيئة المعنية.

## الترحيل

`lib/db/migrations/0027_agent_command_center.sql` ينشئ الجداول الخمسة والفهارس والمفاتيح الخارجية، ويُفعّل RLS عليها بلا أي policy، فلا يصل إليها `anon` أو `authenticated` إطلاقًا، بينما يصل إليها التطبيق بدور المالك.
