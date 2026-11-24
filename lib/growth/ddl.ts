/**
 * The reviewed SQL of migration 0067, as the admin migrate endpoint runs it.
 *
 * Production has exactly one migration path: the statement arrays in
 * app/api/admin/migrate/route.ts. The .sql file is what an isolated database
 * applies. A unit test keeps the two equal, because a divergence would mean the
 * file was tested and something else shipped.
 *
 * Statement order matters. The column is created nullable and without a default
 * so existing accounts keep NULL, and the default is attached afterwards so only
 * new rows are stamped.
 */
export const SIGNUP_ATTRIBUTION_DDL = [
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "createdAt" timestamp`,
  `ALTER TABLE "User" ALTER COLUMN "createdAt" SET DEFAULT now()`,
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "signupSource" varchar(64)`,
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "signupMedium" varchar(64)`,
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "signupCampaign" varchar(64)`,
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "signupReferrer" varchar(190)`,
] as const;
