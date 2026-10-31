-- 1) Provider catalog: the marketplace the UI renders and the agent reads.
create table if not exists integration_provider (
  id text primary key,
  name text not null,
  name_ar text not null,
  category text not null,
  description text,
  description_ar text,
  auth_type text not null default 'oauth2',
  scopes text[] not null default '{}',
  status text not null default 'available',
  is_managed boolean not null default false,
  capabilities text[] not null default '{}',
  docs_url text,
  sort_order int not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2) Connection health + attribution on the existing connection table.
alter table integration_connection
  add column if not exists provider_id text,
  add column if not exists display_name text,
  add column if not exists status text not null default 'connected',
  add column if not exists last_used_at timestamptz,
  add column if not exists last_error text,
  add column if not exists connected_by uuid;

create index if not exists integration_connection_status_idx
  on integration_connection (workspace_id, status);
create index if not exists usage_counter_metric_idx
  on usage_counter (workspace_id, metric, period_start desc);

alter table integration_provider enable row level security;
drop policy if exists provider_read_all on integration_provider;
create policy provider_read_all on integration_provider
  for select using (true);

insert into integration_provider
 (id,name,name_ar,category,description,description_ar,auth_type,scopes,status,is_managed,capabilities,sort_order)
values
 ('gmail','Gmail','جيميل','communication','Read and send email for the user.','قراءة وإرسال البريد نيابة عن المستخدم.','oauth2',array['https://www.googleapis.com/auth/gmail.readonly','https://www.googleapis.com/auth/gmail.send'],'available',true,array['read_mail','send_mail','search_mail'],10),
 ('google_drive','Google Drive','جوجل درايف','storage','Search and read files, and store generated assets.','البحث عن الملفات وقراءتها وحفظ المخرجات.','oauth2',array['https://www.googleapis.com/auth/drive.readonly'],'available',true,array['search_files','read_file','store_file'],20),
 ('google_calendar','Google Calendar','جوجل كالندر','productivity','Read and create calendar events and reminders.','قراءة وإنشاء المواعيد والتذكيرات.','oauth2',array['https://www.googleapis.com/auth/calendar'],'coming_soon',true,array['read_events','create_event'],30),
 ('google_ads','Google Ads','إعلانات جوجل','ads','Create and audit ad campaigns and keywords.','إنشاء ومراجعة حملات الإعلانات والكلمات المفتاحية.','oauth2',array['https://www.googleapis.com/auth/adwords'],'coming_soon',false,array['campaign_create','report_read'],40),
 ('google_business','Google Business Profile','نشاطي على جوجل','listing','Create and update the business profile, posts and reviews.','إنشاء وتحديث ملف النشاط والمنشورات والتقييمات.','oauth2',array['https://www.googleapis.com/auth/business.manage'],'coming_soon',false,array['profile_update','review_reply','post_create'],50),
 ('google_maps','Google Maps Platform','خرائط جوجل','geo','Geocoding, places and map generation.','تحديد المواقع والأماكن وإنشاء الخرائط.','api_key',array[]::text[],'available',false,array['geocode','places_search','map_render'],60),
 ('meta','Meta / Facebook','فيسبوك وميتا','social','Publish and manage Facebook pages and ads.','النشر وإدارة صفحات فيسبوك والإعلانات.','oauth2',array['pages_manage_posts','ads_management'],'coming_soon',false,array['page_post','ads_manage'],70),
 ('instagram','Instagram','إنستغرام','social','Publish reels, photos and stories.','نشر الريلز والصور والقصص.','oauth2',array['instagram_basic','instagram_content_publish'],'coming_soon',false,array['publish_reel','publish_photo'],80),
 ('whatsapp','WhatsApp Business','واتساب للأعمال','communication','Send messages and manage templates.','إرسال الرسائل وإدارة القوالب.','oauth2',array['whatsapp_business_messaging','whatsapp_business_management'],'available',false,array['send_message','template_create'],90),
 ('snapchat','Snapchat','سناب شات','social','Publish and advertise on Snapchat.','النشر والإعلان على سناب شات.','oauth2',array['snapchat-marketing-api'],'coming_soon',false,array['publish_spotlight','ads_manage'],100),
 ('tiktok','TikTok','تيك توك','social','Publish videos through the official content API.','نشر الفيديوهات عبر واجهة المحتوى الرسمية.','oauth2',array['video.publish','video.list'],'coming_soon',false,array['publish_video'],110),
 ('x','X (Twitter)','إكس (تويتر)','social','Post and read timeline content.','النشر وقراءة المحتوى.','oauth2',array['tweet.read','tweet.write','users.read'],'available',true,array['post_tweet'],120),
 ('linkedin','LinkedIn','لينكدإن','social','Post to a personal profile or company page.','النشر على الملف الشخصي أو صفحة الشركة.','oauth2',array['w_member_social'],'available',true,array['post_update'],130),
 ('github','GitHub','جيت هب','dev','Read code, open issues and ship commits.','قراءة الكود وفتح المهام ورفع التعديلات.','oauth2',array['repo','read:user'],'available',true,array['read_repo','push_commit','open_issue'],140),
 ('supabase','Supabase','سوبا بيز','dev','Manage database, auth and storage projects.','إدارة قاعدة البيانات والمصادقة والتخزين.','api_key',array[]::text[],'available',false,array['sql_query','table_manage'],150),
 ('vercel','Vercel','فيرسل','dev','Deploy and inspect projects and domains.','النشر ومراجعة المشاريع والنطاقات.','api_key',array[]::text[],'available',false,array['deploy','inspect'],160),
 ('stripe','Stripe','سترايب','finance','Payments, subscriptions and invoices.','المدفوعات والاشتراكات والفواتير.','api_key',array[]::text[],'available',true,array['checkout','invoice','subscription'],170),
 ('plaid','Plaid / Open Banking','الخدمات المصرفية المفتوحة','finance','Connect bank accounts read-only for cash-flow insight.','ربط الحسابات البنكية للقراءة وتحليل التدفق النقدي.','oauth2',array['transactions.read'],'coming_soon',false,array['bank_balance','bank_transactions'],180),
 ('amadeus','Amadeus Flights','حجوزات الطيران','travel','Search flights, fares and hold bookings.','البحث عن الرحلات والأسعار وتثبيت الحجوزات.','api_key',array[]::text[],'coming_soon',false,array['flight_search','fare_rules','booking_hold'],190),
 ('booking','Booking.com','بوكينج','travel','Search hotels and manage reservations.','البحث عن الفنادق وإدارة الحجوزات.','api_key',array[]::text[],'coming_soon',false,array['hotel_search'],200),
 ('n8n','n8n Automation','أتمتة n8n','automation','Trigger and monitor the workspace automation server.','تشغيل ومراقبة سيرفر الأتمتة.','api_key',array[]::text[],'available',false,array['workflow_trigger','workflow_status'],210),
 ('notion','Notion','نوشن','productivity','Read and write workspace pages and databases.','قراءة وكتابة الصفحات وقواعد البيانات.','oauth2',array['read_content','write_content'],'coming_soon',false,array['page_read','page_write'],220),
 ('slack','Slack','سلاك','communication','Send messages and read channels.','إرسال الرسائل وقراءة القنوات.','oauth2',array['chat:write','channels:read'],'coming_soon',false,array['send_message','read_channel'],230),
 ('shopify','Shopify','شوبيفاي','commerce','Manage products and orders.','إدارة المنتجات والطلبات.','oauth2',array['read_products','write_products'],'coming_soon',false,array['product_manage','order_read'],240),
 ('twilio','Twilio','تويلو','communication','Calls and SMS delivery.','المكالمات والرسائل النصية.','api_key',array[]::text[],'coming_soon',false,array['send_sms','place_call'],250),
 ('agora','Agora / Daily','مكالمات الفيديو','communication','Live voice and video meeting rooms.','غرف الاجتماعات الصوتية والمرئية.','api_key',array[]::text[],'coming_soon',false,array['video_room'],260)
on conflict (id) do update set
  name=excluded.name, name_ar=excluded.name_ar, category=excluded.category,
  description=excluded.description, description_ar=excluded.description_ar,
  auth_type=excluded.auth_type, scopes=excluded.scopes, status=excluded.status,
  is_managed=excluded.is_managed, capabilities=excluded.capabilities,
  sort_order=excluded.sort_order, updated_at=now();
