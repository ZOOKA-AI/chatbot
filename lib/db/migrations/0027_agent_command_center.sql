CREATE TABLE IF NOT EXISTS "AgentIdentity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(64) NOT NULL,
	"displayName" varchar(120) NOT NULL,
	"role" varchar(64) NOT NULL,
	"keyHash" varchar(64) NOT NULL,
	"scopes" json DEFAULT '[]'::json NOT NULL,
	"environment" varchar(24) DEFAULT 'production' NOT NULL,
	"status" varchar(24) DEFAULT 'active' NOT NULL,
	"lastSeenAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "AgentIdentity_slug_key" UNIQUE("slug")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "AgentIdentity_keyHash_idx" ON "AgentIdentity" USING btree ("keyHash");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "AgentTask" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(200) NOT NULL,
	"instruction" text NOT NULL,
	"ownerAgentId" uuid,
	"priority" varchar(16) DEFAULT 'normal' NOT NULL,
	"dependencies" json DEFAULT '[]'::json NOT NULL,
	"environment" varchar(24) DEFAULT 'production' NOT NULL,
	"status" varchar(24) DEFAULT 'pending' NOT NULL,
	"evidence" text,
	"approvalRequired" boolean DEFAULT false NOT NULL,
	"rollbackPlan" text,
	"claimedAt" timestamp,
	"reportedAt" timestamp,
	"createdBy" varchar(64) DEFAULT 'owner' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "AgentTask_status_idx" ON "AgentTask" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "AgentTask_ownerAgentId_idx" ON "AgentTask" USING btree ("ownerAgentId");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "AgentDecision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agentId" uuid,
	"title" varchar(200) NOT NULL,
	"body" text NOT NULL,
	"state" varchar(24) DEFAULT 'PROPOSED' NOT NULL,
	"taskId" uuid,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "AgentDecision_state_idx" ON "AgentDecision" USING btree ("state");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "AgentApproval" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"taskId" uuid,
	"requestedBy" uuid,
	"reason" text NOT NULL,
	"status" varchar(24) DEFAULT 'pending' NOT NULL,
	"decidedBy" varchar(64),
	"decidedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "AgentApproval_status_idx" ON "AgentApproval" USING btree ("status");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "AgentDeployment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"environment" varchar(24) DEFAULT 'production' NOT NULL,
	"commitSha" varchar(64),
	"deploymentId" varchar(120),
	"status" varchar(24) DEFAULT 'pending' NOT NULL,
	"notes" text,
	"agentId" uuid,
	"rollbackOf" uuid,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "AgentDeployment_environment_idx" ON "AgentDeployment" USING btree ("environment");
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "AgentTask" ADD CONSTRAINT "AgentTask_ownerAgentId_AgentIdentity_id_fk" FOREIGN KEY ("ownerAgentId") REFERENCES "public"."AgentIdentity"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "AgentDecision" ADD CONSTRAINT "AgentDecision_agentId_AgentIdentity_id_fk" FOREIGN KEY ("agentId") REFERENCES "public"."AgentIdentity"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "AgentDecision" ADD CONSTRAINT "AgentDecision_taskId_AgentTask_id_fk" FOREIGN KEY ("taskId") REFERENCES "public"."AgentTask"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "AgentApproval" ADD CONSTRAINT "AgentApproval_taskId_AgentTask_id_fk" FOREIGN KEY ("taskId") REFERENCES "public"."AgentTask"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "AgentApproval" ADD CONSTRAINT "AgentApproval_requestedBy_AgentIdentity_id_fk" FOREIGN KEY ("requestedBy") REFERENCES "public"."AgentIdentity"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "AgentDeployment" ADD CONSTRAINT "AgentDeployment_agentId_AgentIdentity_id_fk" FOREIGN KEY ("agentId") REFERENCES "public"."AgentIdentity"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
ALTER TABLE public."AgentIdentity" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public."AgentTask" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public."AgentDecision" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public."AgentApproval" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public."AgentDeployment" ENABLE ROW LEVEL SECURITY;
