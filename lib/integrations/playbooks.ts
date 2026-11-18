import "server-only";

import type { TokenProviderId } from "@/lib/integrations/token-providers";

/**
 * The connection playbook for every provider in the catalog: what the account
 * needs before it can be connected, where the credential is created, and how we
 * prove the connection works. It is written for any workspace, not for ours:
 * a tenant with no accounts yet follows the same steps from zero (create the
 * account, create the credential, paste it into the card, verify).
 */
export type PlaybookConnection =
  | "oauth"
  | "token"
  | "agent_managed"
  | "blocked";

export type PlaybookStep = { en: string; ar: string };

export type IntegrationPlaybook = {
  providerId: string;
  /** False when our side still needs an owner-level secret before a tenant can connect. */
  selfServe: boolean;
  connection: PlaybookConnection;
  /** Card endpoint the pasted credential belongs to, when it differs from the id. */
  tokenProviderId?: TokenProviderId;
  credentialEn: string;
  credentialAr: string;
  prerequisites: PlaybookStep[];
  steps: PlaybookStep[];
  verifyEn: string;
  verifyAr: string;
  limitsEn?: string;
  limitsAr?: string;
  docsUrl?: string;
};

export const INTEGRATION_PLAYBOOKS: IntegrationPlaybook[] = [
  {
    providerId: "instagram",
    selfServe: true,
    connection: "token",
    tokenProviderId: "instagram",
    credentialEn: "Facebook Page access token (long-lived)",
    credentialAr: "توكن وصول لصفحة فيسبوك (طويل الأجل)",
    prerequisites: [
      {
        en: "An Instagram Business or Creator account (Personal accounts have no API).",
        ar: "حساب إنستغرام تجاري أو صانع محتوى (الحساب الشخصي بلا واجهة برمجية).",
      },
      {
        en: "A Facebook Page that the account is linked to, and admin rights on that page.",
        ar: "صفحة فيسبوك مرتبطة بالحساب، وصلاحية مدير على الصفحة.",
      },
      {
        en: "A Meta app with the Instagram Graph API product added.",
        ar: "تطبيق ميتا مضاف إليه منتج Instagram Graph API.",
      },
    ],
    steps: [
      {
        en: "In the Instagram app: Settings → Account type → switch to Business, then link it to the Facebook Page.",
        ar: "في تطبيق إنستغرام: الإعدادات → نوع الحساب → تحويله إلى تجاري، ثم ربطه بصفحة فيسبوك.",
      },
      {
        en: "In developers.facebook.com create an app (type Business), add Instagram Graph API, and request instagram_basic, instagram_content_publish, pages_show_list and pages_read_engagement.",
        ar: "في developers.facebook.com أنشئ تطبيقًا (نوع Business)، أضف Instagram Graph API، واطلب صلاحيات instagram_basic وinstagram_content_publish وpages_show_list وpages_read_engagement.",
      },
      {
        en: "Open Graph API Explorer, pick your app, grant the scopes, then exchange the short token for a long-lived one and take the Page token from GET /me/accounts.",
        ar: "افتح Graph API Explorer، اختر تطبيقك، امنح الصلاحيات، ثم استبدل التوكن القصير بآخر طويل الأجل وخُذ توكن الصفحة من GET /me/accounts.",
      },
      {
        en: "Paste that Page token into the Instagram card here.",
        ar: "الصق توكن الصفحة في كارت إنستغرام هنا.",
      },
    ],
    verifyEn:
      "We call GET /{ig-user} and report the handle, followers and media count.",
    verifyAr: "نستدعي GET /{ig-user} ونعرض اسم الحساب والمتابعين وعدد المنشورات.",
    limitsEn:
      "Publishing supports reels and single images; carousels and stories are not wired. The token must be a Page token, never a user token.",
    limitsAr:
      "النشر يدعم الريلز والصور المفردة؛ الكاروسيل والستوري غير مربوطين. التوكن يجب أن يكون توكن صفحة لا توكن مستخدم.",
    docsUrl: "https://developers.facebook.com/docs/instagram-platform",
  },
  {
    providerId: "meta",
    selfServe: true,
    connection: "token",
    tokenProviderId: "meta",
    credentialEn: "Facebook Page access token",
    credentialAr: "توكن وصول لصفحة فيسبوك",
    prerequisites: [
      {
        en: "A Facebook Page you are an admin of.",
        ar: "صفحة فيسبوك أنت مدير عليها.",
      },
      {
        en: "A Meta app with the Pages API product.",
        ar: "تطبيق ميتا مضاف إليه منتج Pages API.",
      },
    ],
    steps: [
      {
        en: "developers.facebook.com → Create app (Business) → add Pages API.",
        ar: "developers.facebook.com → إنشاء تطبيق (Business) → إضافة Pages API.",
      },
      {
        en: "Request pages_show_list, pages_read_engagement and pages_manage_posts.",
        ar: "اطلب pages_show_list وpages_read_engagement وpages_manage_posts.",
      },
      {
        en: "Take the Page token from GET /me/accounts and paste it into the Facebook card.",
        ar: "خُذ توكن الصفحة من GET /me/accounts والصقه في كارت فيسبوك.",
      },
    ],
    verifyEn: "We read GET /{page-id} and return the page name and follower count.",
    verifyAr: "نقرأ GET /{page-id} ونعيد اسم الصفحة وعدد المتابعين.",
    limitsEn:
      "Without pages_read_user_content we cannot read reactions or comments; publishing is text-only posts.",
    limitsAr:
      "بدون pages_read_user_content لا نقرأ التفاعل والتعليقات؛ والنشر منشورات نصية فقط.",
    docsUrl: "https://developers.facebook.com/docs/pages-api",
  },
  {
    providerId: "linkedin",
    selfServe: true,
    connection: "token",
    tokenProviderId: "linkedin",
    credentialEn: "LinkedIn member access token",
    credentialAr: "توكن وصول عضو لينكدإن",
    prerequisites: [
      {
        en: "A LinkedIn app at developer.linkedin.com (any page, personal profile is enough).",
        ar: "تطبيق لينكدإن على developer.linkedin.com (صفحتك الشخصية تكفي).",
      },
      {
        en: "The products 'Sign In with LinkedIn using OpenID Connect' and 'Share on LinkedIn' added to it.",
        ar: "إضافة منتجي «Sign In with LinkedIn using OpenID Connect» و«Share on LinkedIn».",
      },
    ],
    steps: [
      {
        en: "Create the app, verify it against a company page, then add both products.",
        ar: "أنشئ التطبيق، وثّقه على صفحة شركة، ثم أضف المنتجين.",
      },
      {
        en: "Under Auth, add the redirect https://zooka-ai.com/api/integrations/linkedin/callback and take the Client ID and Secret.",
        ar: "في Auth أضف التحويل https://zooka-ai.com/api/integrations/linkedin/callback وخُذ Client ID وSecret.",
      },
      {
        en: "Request scopes openid profile w_member_social, complete the OAuth flow, and paste the access token into the LinkedIn card.",
        ar: "اطلب الصلاحيات openid profile w_member_social، أكمل تفويض OAuth، والصق توكن الوصول في كارت لينكدإن.",
      },
    ],
    verifyEn: "We call /v2/userinfo and return the member name and email.",
    verifyAr: "نستدعي /v2/userinfo ونعيد اسم العضو وبريده.",
    limitsEn:
      "Member tokens live about 60 days and are not refreshed automatically; reconnect when reads start failing. Company-page posting needs an organization URN.",
    limitsAr:
      "توكن العضو يعيش نحو 60 يومًا ولا يُجدَّد تلقائيًا؛ أعد الربط عند بدء الفشل. النشر على صفحة شركة يحتاج معرّف المؤسسة.",
    docsUrl: "https://learn.microsoft.com/en-us/linkedin/",
  },
  {
    providerId: "snapchat",
    selfServe: true,
    connection: "token",
    tokenProviderId: "snapchat",
    credentialEn: "Snapchat Marketing API access token",
    credentialAr: "توكن وصول Snapchat Marketing API",
    prerequisites: [
      {
        en: "A Snap Business account with an organization and an ad account.",
        ar: "حساب Snap للأعمال فيه مؤسسة وحساب إعلاني.",
      },
      {
        en: "A Snap Kit / Marketing API app (client id, secret, redirect URI).",
        ar: "تطبيق Snap Kit / Marketing API (client id وsecret وredirect URI).",
      },
    ],
    steps: [
      {
        en: "In business.snapchat.com create the organization and ad account.",
        ar: "في business.snapchat.com أنشئ المؤسسة والحساب الإعلاني.",
      },
      {
        en: "At developer.snapchat.com create an app, enable the Marketing API scope, and copy client id and secret.",
        ar: "في developer.snapchat.com أنشئ تطبيقًا، فعّل صلاحية Marketing API، وانسخ client id وsecret.",
      },
      {
        en: "Run the OAuth2 authorization-code flow for scope snapchat-marketing-api and paste the resulting access token into the Snapchat card.",
        ar: "نفّذ تدفق OAuth2 (authorization code) بصلاحية snapchat-marketing-api والصق توكن الوصول الناتج في كارت سناب شات.",
      },
    ],
    verifyEn: "We call GET /v1/me/organizations and return the organization name.",
    verifyAr: "نستدعي GET /v1/me/organizations ونعيد اسم المؤسسة.",
    limitsEn:
      "Access tokens expire in about an hour. Automatic refresh uses the client credentials configured for this workspace; without them, reconnect when reads fail.",
    limitsAr:
      "توكن الوصول ينتهي بعد نحو ساعة. التجديد التلقائي يستخدم بيانات التطبيق المهيّأة لمساحة العمل؛ بدونها أعد الربط عند فشل القراءة.",
    docsUrl: "https://developers.snap.com/api/marketing-api/",
  },
  {
    providerId: "telegram_ads",
    selfServe: true,
    connection: "token",
    tokenProviderId: "telegram_ads",
    credentialEn: "Telegram Ads API token",
    credentialAr: "توكن Telegram Ads API",
    prerequisites: [
      {
        en: "A Telegram ad account at ads.telegram.org (topics must be approved).",
        ar: "حساب إعلاني على ads.telegram.org (ويجب اعتماد المواضيع).",
      },
    ],
    steps: [
      {
        en: "Open ads.telegram.org, finish the account setup, and make sure there is a funded balance.",
        ar: "افتح ads.telegram.org، أكمل إعداد الحساب، وتأكد من وجود رصيد ممول.",
      },
      {
        en: "Account settings → API token → create and copy it.",
        ar: "إعدادات الحساب → API token → أنشئه وانسخه.",
      },
      {
        en: "Paste it into the Telegram Ads card here.",
        ar: "الصقه في كارت تيليجرام أدز هنا.",
      },
    ],
    verifyEn: "We call getCurrentAccount and return the budget and currency.",
    verifyAr: "نستدعي getCurrentAccount ونعيد الميزانية والعملة.",
    limitsEn: "Reads only: account, budgets and ad list. No campaign creation.",
    limitsAr: "قراءة فقط: الحساب والميزانيات وقائمة الإعلانات. لا إنشاء حملات.",
    docsUrl: "https://ads.telegram.org/docs/api",
  },
  {
    providerId: "telegram_bot",
    selfServe: true,
    connection: "token",
    tokenProviderId: "telegram_bot",
    credentialEn: "Bot token from @BotFather",
    credentialAr: "توكن البوت من @BotFather",
    prerequisites: [
      {
        en: "A Telegram account.",
        ar: "حساب تيليجرام.",
      },
    ],
    steps: [
      {
        en: "In Telegram open @BotFather → /newbot → name it, pick a username ending in 'bot'.",
        ar: "في تيليجرام افتح @BotFather → /newbot → سمّه واختر يوزر ينتهي بـbot.",
      },
      {
        en: "BotFather replies with the HTTP API token; copy it.",
        ar: "يرد BotFather بتوكن HTTP API؛ انسخه.",
      },
      {
        en: "Paste it into the Telegram Bot card, then send your chat id to the agent so it can message you.",
        ar: "الصقه في كارت بوت تيليجرام، ثم أرسل معرّف محادثتك للوكيل ليتمكن من مراسلتك.",
      },
    ],
    verifyEn: "We call getMe and getWebhookInfo and return the bot handle and webhook.",
    verifyAr: "نستدعي getMe وgetWebhookInfo ونعيد اسم البوت والويب هوك.",
    limitsEn:
      "The bot can only message chats that started it. Sending needs the chat id.",
    limitsAr:
      "البوت يراسل المحادثات التي بدأته فقط، والإرسال يحتاج معرّف المحادثة.",
    docsUrl: "https://core.telegram.org/bots/api",
  },
  {
    providerId: "improvmx",
    selfServe: true,
    connection: "token",
    tokenProviderId: "improvmx",
    credentialEn: "ImprovMX API key",
    credentialAr: "مفتاح ImprovMX API",
    prerequisites: [
      {
        en: "A domain you control and an ImprovMX account.",
        ar: "نطاق تملكه وحساب ImprovMX.",
      },
    ],
    steps: [
      {
        en: "Add the domain in improvmx.com and copy the MX records it shows into your DNS provider.",
        ar: "أضف النطاق في improvmx.com وانسخ سجلات MX التي يعرضها إلى مزوّد الـDNS.",
      },
      {
        en: "Create aliases (and a catch-all) pointing to the destination mailbox.",
        ar: "أنشئ المرسلات (ومرسلًا عامًا) نحو صندوق البريد المقصود.",
      },
      {
        en: "Account → API → copy the key and paste it into the Email routing card.",
        ar: "الحساب → API → انسخ المفتاح والصقه في كارت توجيه البريد.",
      },
    ],
    verifyEn: "We call GET /v3/domains/ and return each domain with its aliases.",
    verifyAr: "نستدعي GET /v3/domains/ ونعيد كل نطاق ومرسلاته.",
    limitsEn: "Read only: domains and aliases. Creating aliases is not wired yet.",
    limitsAr: "قراءة فقط: النطاقات والمرسلات. إنشاء المرسلات غير مربوط بعد.",
    docsUrl: "https://improvmx.com/api",
  },
  {
    providerId: "google_ads",
    selfServe: true,
    connection: "token",
    tokenProviderId: "ryze",
    credentialEn: "Ryze refresh token (Google Ads access)",
    credentialAr: "توكن تجديد Ryze (وصول إعلانات جوجل)",
    prerequisites: [
      {
        en: "A Google Ads account (manager or standalone) you can sign in to.",
        ar: "حساب إعلانات جوجل (مدير أو مستقل) تستطيع الدخول عليه.",
      },
      {
        en: "A Ryze account, because the Google Ads API developer token is only issued after an approval we do not hold per tenant.",
        ar: "حساب Ryze، لأن developer token الخاصة بواجهة إعلانات جوجل تُمنح بعد موافقة لا نملكها لكل مساحة عمل.",
      },
    ],
    steps: [
      {
        en: "Sign in to get-ryze.ai and connect your Google Ads account inside Ryze.",
        ar: "سجّل الدخول إلى get-ryze.ai واربط حساب إعلانات جوجل داخل Ryze.",
      },
      {
        en: "Copy the Ryze refresh token from the connection settings.",
        ar: "انسخ توكن التجديد من إعدادات الاتصال في Ryze.",
      },
      {
        en: "Paste it into the Google Ads card here.",
        ar: "الصقه في كارت إعلانات جوجل هنا.",
      },
    ],
    verifyEn:
      "We refresh the token, open one MCP session and list the accessible customers with their names.",
    verifyAr:
      "نجدّد التوكن، ونفتح جلسة MCP واحدة، ونسرد الحسابات المتاحة بأسمائها.",
    limitsEn:
      "Read only: customers, account summary and GAQL queries that must start with SELECT. No campaign changes.",
    limitsAr:
      "قراءة فقط: الحسابات وملخص الأداء واستعلامات GAQL التي تبدأ بـSELECT. لا تعديل حملات.",
    docsUrl: "https://get-ryze.ai",
  },
  {
    providerId: "x",
    selfServe: false,
    connection: "oauth",
    credentialEn: "X OAuth 2.0 client id + secret (platform level), then per-user token",
    credentialAr: "Client ID وSecret لتطبيق X (على مستوى المنصة)، ثم توكن لكل مستخدم",
    prerequisites: [
      {
        en: "An X developer account with an app and OAuth 2.0 enabled.",
        ar: "حساب مطوّر على X فيه تطبيق وOAuth 2.0 مفعّل.",
      },
      {
        en: "The server must hold X_CLIENT_ID and X_CLIENT_SECRET.",
        ar: "يجب أن يحمل الخادم X_CLIENT_ID وX_CLIENT_SECRET.",
      },
    ],
    steps: [
      {
        en: "developer.x.com → Projects & Apps → create the app and enable OAuth 2.0 with read and write.",
        ar: "developer.x.com → المشاريع والتطبيقات → أنشئ التطبيق وفعّل OAuth 2.0 بصلاحية قراءة وكتابة.",
      },
      {
        en: "Add https://zooka-ai.com/api/integrations/x/callback as a callback URL.",
        ar: "أضف https://zooka-ai.com/api/integrations/x/callback كعنوان تحويل.",
      },
      {
        en: "Put the client id and secret in the deployment environment; after that each user connects with one click.",
        ar: "ضع client id وsecret في بيئة النشر؛ بعدها كل مستخدم يربط بضغطة واحدة.",
      },
    ],
    verifyEn: "We read GET /2/users/me with the user token.",
    verifyAr: "نقرأ GET /2/users/me بتوكن المستخدم.",
    limitsEn:
      "Blocked until the platform-level client id and secret exist; no per-tenant workaround.",
    limitsAr:
      "محجوب حتى يتوفر client id وsecret على مستوى المنصة؛ لا حل بديل لكل مساحة عمل.",
    docsUrl: "https://developer.x.com/en/docs/authentication/oauth-2-0",
  },
  {
    providerId: "whatsapp",
    selfServe: false,
    connection: "blocked",
    credentialEn: "WhatsApp Business: phone number id, system-user token, app secret",
    credentialAr: "واتساب للأعمال: معرّف الرقم، توكن مستخدم نظام، سر التطبيق",
    prerequisites: [
      {
        en: "A Meta Business account verified for the business.",
        ar: "حساب ميتا للأعمال موثّق للشركة.",
      },
      {
        en: "A WhatsApp Business Account with an approved display name and a number.",
        ar: "حساب واتساب أعمال باسم عرض معتمد ورقم.",
      },
    ],
    steps: [
      {
        en: "In developers.facebook.com add the WhatsApp product to the app.",
        ar: "في developers.facebook.com أضف منتج WhatsApp إلى التطبيق.",
      },
      {
        en: "Link the WhatsApp Business Account and the phone number, then verify the number.",
        ar: "اربط حساب واتساب أعمال والرقم، ثم وثّق الرقم.",
      },
      {
        en: "Create a system-user token with whatsapp_business_messaging and copy the phone number id and app secret.",
        ar: "أنشئ توكن مستخدم نظام بصلاحية whatsapp_business_messaging وانسخ معرّف الرقم وسر التطبيق.",
      },
    ],
    verifyEn: "A signed webhook POST plus one test text message.",
    verifyAr: "طلب موقّع على الويب هوك مع رسالة نصية تجريبية واحدة.",
    limitsEn:
      "Needs WHATSAPP_APP_SECRET and an assigned business account; without both the webhook answers 500 and no reply is sent.",
    limitsAr:
      "يحتاج WHATSAPP_APP_SECRET وحساب أعمال مسندًا؛ بدونهما يرد الويب هوك 500 ولا يُرسل أي رد.",
    docsUrl: "https://developers.facebook.com/docs/whatsapp/cloud-api",
  },
  {
    providerId: "tiktok",
    selfServe: false,
    connection: "blocked",
    credentialEn: "TikTok Content Posting API tokens (Login Kit)",
    credentialAr: "توكنات TikTok Content Posting API (Login Kit)",
    prerequisites: [
      {
        en: "A TikTok developer app with Login Kit and Content Posting API added.",
        ar: "تطبيق مطوّر TikTok فيه Login Kit وContent Posting API.",
      },
      {
        en: "The redirect URI registered on the same domain our app runs on.",
        ar: "تسجيل redirect URI على نفس نطاق تطبيقنا.",
      },
      {
        en: "App review passed for direct posting (unaudited apps are limited to inbox drafts).",
        ar: "اعتماد التطبيق للنشر المباشر (التطبيق غير المعتمد محصور في مسودات الصندوق).",
      },
    ],
    steps: [
      {
        en: "developers.tiktok.com → create the app → add Login Kit and Content Posting API.",
        ar: "developers.tiktok.com → أنشئ التطبيق → أضف Login Kit وContent Posting API.",
      },
      {
        en: "Register the redirect URI, then submit the app for review with a screen-recorded publishing demo.",
        ar: "سجّل redirect URI، ثم قدّم التطبيق للمراجعة بعرض مصوّر لدورة النشر.",
      },
      {
        en: "After approval, run the OAuth flow and paste the tokens.",
        ar: "بعد الاعتماد نفّذ تدفق OAuth والصق التوكنات.",
      },
    ],
    verifyEn: "GET /v2/user/info/ with the token.",
    verifyAr: "GET /v2/user/info/ بالتوكن.",
    limitsEn:
      "Until review passes, the working route is the inbox draft upload: the video lands as a draft and the owner posts it.",
    limitsAr:
      "قبل اجتياز المراجعة يعمل مسار رفع المسودة للصندوق: الفيديو يصل كمسودة والمالك ينشره.",
    docsUrl: "https://developers.tiktok.com/doc/content-posting-api-get-started",
  },
  {
    providerId: "slack",
    selfServe: false,
    connection: "token",
    credentialEn: "Slack bot token (xoxb)",
    credentialAr: "توكن بوت سلاك (xoxb)",
    prerequisites: [
      {
        en: "A Slack workspace where you can install apps.",
        ar: "مساحة سلاك تستطيع تثبيت التطبيقات فيها.",
      },
    ],
    steps: [
      {
        en: "api.slack.com/apps → Create New App → From scratch → pick the workspace.",
        ar: "api.slack.com/apps → تطبيق جديد → من الصفر → اختر المساحة.",
      },
      {
        en: "OAuth & Permissions → add chat:write, channels:read, users:read → Install to Workspace.",
        ar: "OAuth & Permissions → أضف chat:write وchannels:read وusers:read → التثبيت في المساحة.",
      },
      {
        en: "Copy the Bot User OAuth Token (xoxb-…) into the Slack card.",
        ar: "انسخ Bot User OAuth Token (xoxb-…) إلى كارت سلاك.",
      },
    ],
    verifyEn: "auth.test returns the bot name and team.",
    verifyAr: "auth.test يعيد اسم البوت والفريق.",
    limitsEn: "Sending and reading are not built yet; the card stores the credential only.",
    limitsAr: "الإرسال والقراءة غير مبنيين بعد؛ الكارت يخزّن الاعتماد فقط.",
    docsUrl: "https://api.slack.com/authentication/token-types",
  },
  {
    providerId: "notion",
    selfServe: false,
    connection: "token",
    credentialEn: "Notion internal integration secret",
    credentialAr: "سر تكامل نوشن الداخلي",
    prerequisites: [
      {
        en: "A Notion workspace where you are an admin.",
        ar: "مساحة نوشن أنت مدير عليها.",
      },
    ],
    steps: [
      {
        en: "notion.so/my-integrations → New integration → pick the workspace.",
        ar: "notion.so/my-integrations → تكامل جديد → اختر المساحة.",
      },
      {
        en: "Copy the internal integration secret and share the target pages with the integration.",
        ar: "انسخ السر الداخلي وشارك الصفحات المطلوبة مع التكامل.",
      },
      {
        en: "Paste the secret into the Notion card.",
        ar: "الصق السر في كارت نوشن.",
      },
    ],
    verifyEn: "GET /v1/users/me returns the bot and workspace name.",
    verifyAr: "GET /v1/users/me يعيد البوت واسم المساحة.",
    limitsEn: "Read/write tools are not built yet; the card stores the credential only.",
    limitsAr: "أدوات القراءة والكتابة غير مبنية بعد؛ الكارت يخزّن الاعتماد فقط.",
    docsUrl: "https://developers.notion.com/docs/authorization",
  },
  {
    providerId: "twilio",
    selfServe: false,
    connection: "token",
    credentialEn: "Twilio Account SID + Auth Token (+ a sending number)",
    credentialAr: "Twilio Account SID وAuth Token (ورقم للإرسال)",
    prerequisites: [
      {
        en: "A Twilio account with a verified sender number (A2P registration for US traffic).",
        ar: "حساب تويلو برقم مُرسل موثّق (وتسجيل A2P للولايات المتحدة).",
      },
    ],
    steps: [
      {
        en: "console.twilio.com → Account Info → copy Account SID and Auth Token.",
        ar: "console.twilio.com → معلومات الحساب → انسخ Account SID وAuth Token.",
      },
      {
        en: "Phone Numbers → buy or verify the sender number.",
        ar: "الأرقام → اشترِ أو وثّق رقم الإرسال.",
      },
      {
        en: "Paste them into the Twilio card, separated by a colon.",
        ar: "الصقهما في كارت تويلو مفصولين بنقطتين.",
      },
    ],
    verifyEn: "GET /2010-04-01/Accounts/{sid}.json returns the account.",
    verifyAr: "GET /2010-04-01/Accounts/{sid}.json يعيد الحساب.",
    limitsEn: "No call or SMS tool is built yet; the card stores the credential only.",
    limitsAr: "لا أداة مكالمات أو رسائل بعد؛ الكارت يخزّن الاعتماد فقط.",
    docsUrl: "https://www.twilio.com/docs/usage/api",
  },
  {
    providerId: "shopify",
    selfServe: false,
    connection: "token",
    credentialEn: "Shopify Admin API access token + store domain",
    credentialAr: "توكن Shopify Admin API ونطاق المتجر",
    prerequisites: [
      {
        en: "A Shopify store on a plan that allows custom apps.",
        ar: "متجر شوبيفاي على خطة تسمح بالتطبيقات المخصّصة.",
      },
    ],
    steps: [
      {
        en: "Shopify admin → Settings → Apps and sales channels → Develop apps → Create app.",
        ar: "لوحة شوبيفاي → الإعدادات → التطبيقات → تطوير التطبيقات → إنشاء تطبيق.",
      },
      {
        en: "Configure Admin API scopes (read_products, read_orders, write_products) and install.",
        ar: "اضبط صلاحيات Admin API (read_products وread_orders وwrite_products) ثم ثبّت.",
      },
      {
        en: "Copy the Admin API access token and paste it with the store domain.",
        ar: "انسخ توكن Admin API والصقه مع نطاق المتجر.",
      },
    ],
    verifyEn: "GET /admin/api/2024-10/shop.json returns the shop.",
    verifyAr: "GET /admin/api/2024-10/shop.json يعيد المتجر.",
    limitsEn: "Product and order tools are not built yet; the card stores the credential only.",
    limitsAr: "أدوات المنتجات والطلبات غير مبنية بعد؛ الكارت يخزّن الاعتماد فقط.",
    docsUrl: "https://shopify.dev/docs/apps/auth/admin-app-access-tokens",
  },
  {
    providerId: "cloudflare",
    selfServe: true,
    connection: "token",
    tokenProviderId: "cloudflare",
    credentialEn: "Cloudflare API token (scoped: Zone:Read, plus DNS:Edit if needed)",
    credentialAr: "توكن Cloudflare API (بنطاق Zone:Read وDNS:Edit عند الحاجة)",
    prerequisites: [
      {
        en: "A Cloudflare account with at least one zone (domain).",
        ar: "حساب كلاودفلير فيه نطاق واحد على الأقل.",
      },
    ],
    steps: [
      {
        en: "dash.cloudflare.com → My Profile → API Tokens → Create Token → use the 'Read all resources' template or a custom token with Zone:Read.",
        ar: "dash.cloudflare.com → الملف الشخصي → توكنات API → إنشاء توكن → استخدم قالب قراءة كل الموارد أو توكنًا مخصصًا بصلاحية Zone:Read.",
      },
      {
        en: "Restrict the token to the account and zones you actually want the agent to read.",
        ar: "قيّد التوكن على الحساب والنطاقات التي تريد أن يقرأها الوكيل فقط.",
      },
      {
        en: "Paste the token into the Cloudflare card here; we verify it against /user/tokens/verify before storing it.",
        ar: "الصق التوكن في كارت كلاودفلير هنا؛ نتحقق منه عبر /user/tokens/verify قبل حفظه.",
      },
    ],
    verifyEn: "We call /client/v4/user/tokens/verify and then list up to 20 zones.",
    verifyAr: "نستدعي /client/v4/user/tokens/verify ثم نسرد حتى 20 نطاقًا.",
    limitsEn: "Reads only: token status and zones. DNS record changes are not implemented.",
    limitsAr: "قراءة فقط: حالة التوكن والنطاقات. تعديل سجلات DNS غير منفّذ.",
    docsUrl: "https://developers.cloudflare.com/fundamentals/api/get-started/create-token/",
  },
  {
    providerId: "namecheap",
    selfServe: false,
    connection: "blocked",
    credentialEn: "Namecheap API user + key, with the egress IP allowlisted",
    credentialAr: "مستخدم ومفتاح Namecheap API مع السماح لعنوان IP الصادر",
    prerequisites: [
      {
        en: "API access enabled on the Namecheap account (Profile → Tools → Namecheap API Access).",
        ar: "تفعيل وصول API في حساب نيم تشيب (الملف → الأدوات → Namecheap API Access).",
      },
      {
        en: "This platform's egress IP added to the allowlist; Namecheap rejects every other IP with error 1011100.",
        ar: "إضافة عنوان IP الصادر للمنصة إلى قائمة السماح؛ نيم تشيب يرفض أي IP آخر بالخطأ 1011100.",
      },
    ],
    steps: [
      {
        en: "Enable API access and copy the API user and key.",
        ar: "فعّل وصول API وانسخ مستخدم API والمفتاح.",
      },
      {
        en: "Add the egress IP shown by our diagnostic to the allowlist in the same screen.",
        ar: "أضف عنوان IP الصادر الذي يعرضه تشخيصنا إلى قائمة السماح في نفس الشاشة.",
      },
      {
        en: "Until the IP is allowlisted the connector cannot answer at all, so the card stays closed instead of failing silently.",
        ar: "قبل السماح للـIP لا يستطيع الموصل الرد إطلاقًا، لذلك يبقى الكارت مغلقًا بدل الفشل الصامت.",
      },
    ],
    verifyEn: "namecheap.users.getBalances over HTTPS with the client IP sent explicitly.",
    verifyAr: "نداء namecheap.users.getBalances عبر HTTPS مع إرسال IP العميل صراحةً.",
    limitsEn: "Blocked by the IP allowlist today; reads only when it opens.",
    limitsAr: "محجوب بقائمة السماح اليوم؛ قراءة فقط عند فتحها.",
    docsUrl: "https://www.namecheap.com/support/api/",
  },
  {
    providerId: "gmail",
    selfServe: true,
    connection: "oauth",
    credentialEn: "Google OAuth (one click)",
    credentialAr: "تفويض جوجل (بضغطة)",
    prerequisites: [
      {
        en: "Nothing on your side: we hold the Google OAuth app.",
        ar: "لا شيء من جهتك: تطبيق OAuth عندنا.",
      },
    ],
    steps: [
      {
        en: "Press Connect on the Gmail card and pick the Google account.",
        ar: "اضغط ربط في كارت جيميل واختر حساب جوجل.",
      },
      {
        en: "Grant the read and send permissions on the Google consent screen.",
        ar: "امنح صلاحيات القراءة والإرسال في شاشة موافقة جوجل.",
      },
    ],
    verifyEn: "We read the profile from the token and list one inbox thread.",
    verifyAr: "نقرأ الملف من التوكن ونسرد سلسلة واحدة من البريد.",
  },
  {
    providerId: "google_drive",
    selfServe: true,
    connection: "oauth",
    credentialEn: "Google OAuth (one click)",
    credentialAr: "تفويض جوجل (بضغطة)",
    prerequisites: [
      {
        en: "Nothing on your side.",
        ar: "لا شيء من جهتك.",
      },
    ],
    steps: [
      {
        en: "Press Connect on the Google Drive card and approve the scopes.",
        ar: "اضغط ربط في كارت جوجل درايف ووافق على الصلاحيات.",
      },
    ],
    verifyEn: "We list your Drive files once.",
    verifyAr: "نسرد ملفات درايف مرة واحدة.",
  },
  {
    providerId: "google_calendar",
    selfServe: true,
    connection: "oauth",
    credentialEn: "Google OAuth (one click)",
    credentialAr: "تفويض جوجل (بضغطة)",
    prerequisites: [
      {
        en: "Nothing on your side.",
        ar: "لا شيء من جهتك.",
      },
    ],
    steps: [
      {
        en: "Press Connect on the Google Calendar card and approve the scope.",
        ar: "اضغط ربط في كارت جوجل كالندر ووافق على الصلاحية.",
      },
    ],
    verifyEn: "We read the primary calendar once.",
    verifyAr: "نقرأ التقويم الأساسي مرة واحدة.",
  },
  {
    providerId: "github",
    selfServe: true,
    connection: "token",
    credentialEn: "GitHub personal access token or OAuth",
    credentialAr: "توكن وصول شخصي لجيت هب أو OAuth",
    prerequisites: [
      {
        en: "A GitHub account.",
        ar: "حساب جيت هب.",
      },
    ],
    steps: [
      {
        en: "github.com/settings/tokens → Generate new token (classic) with repo and read:org.",
        ar: "github.com/settings/tokens → أنشئ توكنًا جديدًا (classic) بصلاحيتي repo وread:org.",
      },
      {
        en: "Paste it into the GitHub card.",
        ar: "الصقه في كارت جيت هب.",
      },
    ],
    verifyEn: "GET /user returns the login and name.",
    verifyAr: "GET /user يعيد اسم الدخول والاسم.",
    limitsEn:
      "Workflow files and Actions cannot be changed unless the token also carries the workflow scope.",
    limitsAr:
      "ملفات سير العمل وActions لا تتغير إلا إذا حمل التوكن صلاحية workflow أيضًا.",
  },
  {
    providerId: "vercel",
    selfServe: true,
    connection: "token",
    credentialEn: "Vercel access token",
    credentialAr: "توكن وصول فيرسل",
    prerequisites: [
      {
        en: "A Vercel account with access to the team.",
        ar: "حساب فيرسل بوصول إلى الفريق.",
      },
    ],
    steps: [
      {
        en: "vercel.com/account/tokens → Create token → scope it to the team.",
        ar: "vercel.com/account/tokens → إنشاء توكن → حدّده للفريق.",
      },
      {
        en: "Paste it into the Vercel card.",
        ar: "الصقه في كارت فيرسل.",
      },
    ],
    verifyEn: "GET /v2/user returns the account.",
    verifyAr: "GET /v2/user يعيد الحساب.",
  },
  {
    providerId: "supabase",
    selfServe: true,
    connection: "token",
    credentialEn: "Supabase personal access token",
    credentialAr: "توكن وصول شخصي لسوبا بيز",
    prerequisites: [
      {
        en: "A Supabase account with at least one organization.",
        ar: "حساب سوبا بيز فيه منظمة واحدة على الأقل.",
      },
    ],
    steps: [
      {
        en: "supabase.com/dashboard/account/tokens → generate a token.",
        ar: "supabase.com/dashboard/account/tokens → أنشئ توكنًا.",
      },
      {
        en: "Paste it into the Supabase card.",
        ar: "الصقه في كارت سوبا بيز.",
      },
    ],
    verifyEn: "GET /v1/organizations returns the organizations.",
    verifyAr: "GET /v1/organizations يعيد المنظمات.",
  },
  {
    providerId: "stripe",
    selfServe: false,
    connection: "token",
    credentialEn: "Stripe restricted or secret API key",
    credentialAr: "مفتاح سترايب المقيّد أو السري",
    prerequisites: [
      {
        en: "A Stripe account with the account activated.",
        ar: "حساب سترايب مفعّل.",
      },
    ],
    steps: [
      {
        en: "dashboard.stripe.com/apikeys → create a restricted key with read access, or use the secret key.",
        ar: "dashboard.stripe.com/apikeys → أنشئ مفتاحًا مقيّدًا للقراءة، أو استخدم المفتاح السري.",
      },
      {
        en: "Paste it into the Stripe card.",
        ar: "الصقه في كارت سترايب.",
      },
    ],
    verifyEn: "GET /v1/account returns the account name and country.",
    verifyAr: "GET /v1/account يعيد اسم الحساب والدولة.",
    limitsEn:
      "Never paste a key with full write access for reads; use a restricted key and rotate it after disconnecting.",
    limitsAr:
      "لا تلصق مفتاحًا كامل الكتابة للقراءة؛ استخدم مفتاحًا مقيّدًا وبدّله بعد الفصل.",
  },
  {
    providerId: "n8n",
    selfServe: true,
    connection: "token",
    credentialEn: "n8n instance URL + API key",
    credentialAr: "رابط خادم n8n ومفتاح API",
    prerequisites: [
      {
        en: "A self-hosted or cloud n8n instance you can reach over HTTPS.",
        ar: "خادم n8n ذاتي أو سحابي يمكن الوصول إليه عبر HTTPS.",
      },
    ],
    steps: [
      {
        en: "In n8n: Settings → n8n API → create an API key.",
        ar: "في n8n: الإعدادات → n8n API → أنشئ مفتاحًا.",
      },
      {
        en: "Enter the instance URL and the key in the n8n card.",
        ar: "أدخل رابط الخادم والمفتاح في كارت n8n.",
      },
    ],
    verifyEn: "GET /api/v1/workflows returns one workflow.",
    verifyAr: "GET /api/v1/workflows يعيد سير عمل واحدًا.",
  },
  {
    providerId: "google_maps",
    selfServe: false,
    connection: "agent_managed",
    credentialEn: "Google Cloud Maps Platform API key (platform level)",
    credentialAr: "مفتاح Google Cloud Maps Platform (على مستوى المنصة)",
    prerequisites: [
      {
        en: "A Google Cloud project with billing enabled.",
        ar: "مشروع Google Cloud مفعّل الدفع فيه.",
      },
    ],
    steps: [
      {
        en: "In Google Cloud enable Maps JavaScript, Places and Geocoding APIs.",
        ar: "في Google Cloud فعّل Maps JavaScript وPlaces وGeocoding.",
      },
      {
        en: "Create an API key restricted to the domain and put it in the deployment environment.",
        ar: "أنشئ مفتاح API مقيّدًا بالنطاق وضعه في بيئة النشر.",
      },
    ],
    verifyEn: "We geocode one known address and compare the coordinates.",
    verifyAr: "نحوّل عنوانًا معروفًا إلى إحداثيات ونقارنها.",
    limitsEn: "Works through the agent, not a per-tenant card.",
    limitsAr: "يعمل عبر الوكيل لا بكارت لكل مساحة عمل.",
  },
  {
    // Deliberately "blocked": the provider documents an external agent API, but nothing here has
    // verified that a third party may use it, and no authenticated call exists to point at. A playbook
    // that pretended otherwise would be an invented integration.
    providerId: "base44_superagent",
    selfServe: false,
    connection: "blocked",
    credentialEn:
      "None yet. Base44 documents an agent API key sent as an api_key header against the agent's own base URL; no key has been issued for ZOOKA-AI and no call has been verified.",
    credentialAr:
      "لا يوجد بعد. توثّق Base44 مفتاح واجهة يُرسل في ترويسة api_key إلى العنوان الأساسي الخاص بالوكيل؛ لم يُصدر مفتاح لـ ZOOKA-AI ولم يُتحقق أي استدعاء.",
    prerequisites: [
      {
        en: "Written confirmation that Base44's terms allow a third-party product to call a Superagent's API.",
        ar: "تأكيد مكتوب بأن شروط Base44 تسمح لمنتج طرف ثالث باستدعاء واجهة الوكيل.",
      },
      {
        en: "An owner-issued API key for a Superagent this workspace controls.",
        ar: "مفتاح واجهة يصدره المالك لوكيل تملكه هذه المساحة.",
      },
    ],
    steps: [
      {
        en: "Read the official Agent API documentation in the Superagent's Developer panel before writing any client code.",
        ar: "اقرأ توثيق واجهة الوكيل الرسمي في لوحة المطوّر داخل الوكيل قبل كتابة أي كود.",
      },
      {
        en: "Prove one authenticated call (create or fetch a conversation) from a non-production environment and record the response shape.",
        ar: "أثبت استدعاءً موثّقًا واحدًا (إنشاء أو جلب محادثة) من بيئة غير إنتاجية وسجّل شكل الاستجابة.",
      },
    ],
    verifyEn:
      "A verified connection means one real authenticated call returned a conversation id. Until that exists the card stays 'Not available — API unverified'.",
    verifyAr:
      "الاتصال الموثّق يعني استدعاءً موثّقًا حقيقيًا أعاد معرّف محادثة. وإلى أن يحدث ذلك تبقى البطاقة «غير متاح — الواجهة البرمجية غير موثّقة».",
    limitsEn: "Not documented for third-party use: do not assume rate limits, quotas or a support commitment.",
    limitsAr: "غير موثّق للاستخدام من طرف ثالث: لا تفترض حدودًا أو حصصًا أو التزام دعم.",
    docsUrl: "https://docs.base44.com/Getting-Started/ai-agent",
  },
];

const PLAYBOOK_INDEX = new Map(
  INTEGRATION_PLAYBOOKS.map((playbook) => [playbook.providerId, playbook])
);

export function getPlaybook(providerId: string) {
  return PLAYBOOK_INDEX.get(providerId) ?? null;
}

export function playbookTokenProvider(providerId: string) {
  return PLAYBOOK_INDEX.get(providerId)?.tokenProviderId ?? null;
}
