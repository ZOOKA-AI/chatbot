CREATE TABLE IF NOT EXISTS "BlogPost" (
	"slug" text PRIMARY KEY NOT NULL,
	"lang" varchar(8) DEFAULT 'en' NOT NULL,
	"title" text NOT NULL,
	"excerpt" text,
	"body" text NOT NULL,
	"keyword" text,
	"status" varchar(16) DEFAULT 'draft' NOT NULL,
	"author" text DEFAULT 'Zooka AI' NOT NULL,
	"published_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "BlogPost_status_published_at_idx" ON "BlogPost" USING btree ("status","published_at");
--> statement-breakpoint
ALTER TABLE "BlogPost" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
  EXECUTE 'REVOKE ALL ON TABLE "BlogPost" FROM anon';
 END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
  EXECUTE 'REVOKE ALL ON TABLE "BlogPost" FROM authenticated';
 END IF;
END $$;
