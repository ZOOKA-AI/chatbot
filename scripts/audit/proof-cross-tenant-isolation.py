import json, subprocess, secrets
DB="127.0.0.1:55436/zooka_proof"
SU=f"postgres://postgres@{DB}"; RT=f"postgres://zooka_runtime@{DB}"

def raw(url,sql):
    p=subprocess.run(["psql",url,"-At","-c",sql],capture_output=True,text=True)
    return p.stdout,p.stderr,p.returncode
def one(url,sql):
    o,e,rc=raw(url,sql)
    if rc!=0: return "ERR:"+e.strip().splitlines()[0][:70]
    return o.strip().splitlines()[-1] if o.strip() else ""
def tx(url,org,user,query):
    c=json.dumps({"sub":user,"role":"authenticated"}).replace("'","''")
    sql=(f"BEGIN; select set_config('app.organization_id','{org}',true); "
         f"select set_config('app.user_id','{user}',true); "
         f"select set_config('request.jwt.claims','{c}',true); {query} COMMIT;")
    o,e,rc=raw(url,sql)
    if rc!=0: return "REFUSED: "+e.strip().splitlines()[0][:80]
    keep=[l for l in o.splitlines() if l.strip() and l.strip() not in ('BEGIN','COMMIT','ROLLBACK','SET','INSERT 0 1','DELETE 1')]
    return keep[-1] if keep else "ok"

pw=secrets.token_urlsafe(24)
raw(SU,f"""DO $$ BEGIN IF to_regrole('zooka_runtime') IS NULL THEN
 CREATE ROLE zooka_runtime LOGIN PASSWORD '{pw}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT; END IF; END $$;""")
raw(SU,"GRANT USAGE ON SCHEMA public TO zooka_runtime")
raw(SU,"""DO $$ DECLARE r record;
 svc text[] := ARRAY['Account','Session','VerificationToken','EmailVerificationToken','PasswordResetToken','PhoneOtp','WebhookEvent','SchedulerRun','GuestUsage','EmailSuppression','RewardLedger','GrowthSettings','GrowthAudit','ReferralProfile','ReferralInvite','LaunchTestingClaim','lead','price_snapshot','_selfhost_migrations'];
BEGIN FOR r IN SELECT c.relname FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind='r'
 AND NOT (c.relname=ANY(svc)) LOOP EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO zooka_runtime',r.relname); END LOOP; END $$;""")

role=one(SU,"select rolsuper||'|'||rolbypassrls||'|'||rolcreatedb||'|'||rolcreaterole from pg_roles where rolname='zooka_runtime'")
gsel=one(SU,"select count(distinct table_name) from information_schema.role_table_grants where grantee='zooka_runtime' and privilege_type='SELECT'")
cancreate=one(SU,"select has_schema_privilege('zooka_runtime','public','CREATE')")
orgA=one(SU,'select "organizationId"::text from "Chat" group by 1 order by count(*) desc limit 1')
orgB=one(SU,'select "organizationId"::text from "Chat" group by 1 order by count(*) desc offset 1 limit 1')
usrA=one(SU,f'select "userId"::text from "OrganizationMember" where "organizationId"=\'{orgA}\'::uuid limit 1')
usrB=one(SU,f'select "userId"::text from "OrganizationMember" where "organizationId"=\'{orgB}\'::uuid limit 1')
chatB=one(SU,f'select id::text from "Chat" where "organizationId"=\'{orgB}\'::uuid limit 1')
msgB=one(SU,f'select m.id::text from "Message_v2" m join "Chat" c on c.id=m."chatId" where c."organizationId"=\'{orgB}\'::uuid limit 1')
T=[('Chat','o'),('Document','o'),('UsageEvent','o'),('Message_v2','j')]
def truth(t,k,org):
    if k=='o': return one(SU,f'select count(*) from "{t}" where "organizationId"=\'{org}\'::uuid')
    return one(SU,f'select count(*) from "Message_v2" m join "Chat" c on c.id=m."chatId" where c."organizationId"=\'{org}\'::uuid')
def query(t,k,org):
    if k=='o': return f'select count(*) from "{t}" where "organizationId"=\'{org}\'::uuid;'
    return f'select count(*) from "Message_v2" m join "Chat" c on c.id=m."chatId" where c."organizationId"=\'{org}\'::uuid;'

r={}
r['no_context']={t:tx(RT,'','',f'select count(*) from "{t}";') for t,_ in T+[('Organization','x'),('OrganizationMember','x')]}
r['A_expected']={t:truth(t,k,orgA) for t,k in T}
r['B_expected']={t:truth(t,k,orgB) for t,k in T}
r['A_sees_own']={t:tx(RT,orgA,usrA,f'select count(*) from "{t}";') for t,_ in T}
r['A_sees_B_rows']={t:tx(RT,orgA,usrA,query(t,k,orgB)) for t,k in T}
r['own_org_row']=tx(RT,orgA,usrA,f'select count(*) from "Organization" where id=\'{orgA}\'::uuid;')
r['B_org_row_from_A']=tx(RT,orgA,usrA,f'select count(*) from "Organization" where id=\'{orgB}\'::uuid;')
r['B_chat_by_id_from_A']=tx(RT,orgA,usrA,f'select count(*) from "Chat" where id=\'{chatB}\'::uuid;')
r['B_message_by_id_from_A']=tx(RT,orgA,usrA,f'select count(*) from "Message_v2" where id=\'{msgB}\'::uuid;')
r['update_B_chat_from_A']=tx(RT,orgA,usrA,f'UPDATE "Chat" SET title=\'probe\' WHERE id=\'{chatB}\'::uuid;')
r['delete_B_chat_from_A']=tx(RT,orgA,usrA,f'DELETE FROM "Chat" WHERE id=\'{chatB}\'::uuid;')
r['B_chat_untouched']=one(SU,f'select count(*) from "Chat" where id=\'{chatB}\'::uuid and title is distinct from \'probe\'')
r['insert_into_B_from_A']=tx(RT,orgA,usrA,f'''INSERT INTO "Chat" (id,"organizationId","userId","createdAt",title,"visibility") VALUES (gen_random_uuid(),'{orgB}'::uuid,'{usrB}'::uuid,now(),'isolation probe','private');''')
r['probe_rows_written']=one(SU,"select count(*) from \"Chat\" where title='isolation probe'")
for lbl,s in [('runtime_disable_rls','ALTER TABLE "Chat" DISABLE ROW LEVEL SECURITY;'),
              ('runtime_create_table','CREATE TABLE zk_probe(i int);'),
              ('runtime_set_role_postgres','SET ROLE postgres;'),
              ('runtime_reads_Account','select count(*) from "Account";'),
              ('runtime_reads_Session','select count(*) from "Session";')]:
    o,e,rc=raw(RT,s); r[lbl]="REFUSED" if rc!=0 else "ALLOWED (defect)"
r['chat_rls_enabled']=one(SU,"select relrowsecurity from pg_class where relname='Chat'")
r['real_rows_total']={t:one(SU,f'select count(*) from "{t}"') for t,_ in T}
print(json.dumps({"role_super_bypass_createdb_createrole":role,"runtime_select_tables":gsel,"can_create_on_public":cancreate,
 "orgA":orgA[:8],"orgB":orgB[:8],**r},indent=1,ensure_ascii=False))
