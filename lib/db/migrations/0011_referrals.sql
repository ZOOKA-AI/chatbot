CREATE TABLE IF NOT EXISTS "Affiliate" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(64) NOT NULL,
	"name" varchar(255),
	"platform" varchar(64),
	"commissionPct" integer DEFAULT 20 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "Affiliate_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ReferralEvent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(64) NOT NULL,
	"event" varchar(16) NOT NULL,
	"userId" uuid,
	"organizationId" uuid,
	"plan" varchar(32),
	"amountCents" integer,
	"externalRef" varchar(255),
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ReferralEvent_code_idx" ON "ReferralEvent" ("code");
