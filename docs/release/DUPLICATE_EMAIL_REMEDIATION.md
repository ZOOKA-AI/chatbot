# Duplicate email remediation (measurement first, no destructive step)

0029 creates `User_email_lower_key`, a unique index on `lower(email)`. It refuses to run
while two rows share one, and that refusal is the correct behaviour: silently picking a
winner would orphan one account's chats, documents and executions.

## What production actually contains

Measured against the admin backup generated 2026-11-16T16:15:34Z (873,467 bytes, 14 tables):

| Measure | Value |
| --- | --- |
| Users | 278 |
| Groups sharing a `lower(email)` | **0** |
| Rows inside those groups | 0 |
| Blank or null emails | 0 |
| Emails with leading/trailing whitespace | 0 |

So the precondition is **satisfied today**: 0029 will build its index without a merge step.
That is a measurement, not an assumption, and it is the reason no remediation is needed
before the migration.

## The constraint is missing, the data is clean

Both facts are true and they matter differently. In the reconstructed production schema a
second row with an existing email inserts successfully, so nothing in production enforces
uniqueness today; but no such row exists in the live data. The risk is therefore future,
not present, which is exactly what 0029 closes. Until it lands, registration must keep
relying on the application check, and the check alone is a race.

## Detection (read only)

Run before the migration window and after it:

```sql
select lower(email) as key, count(*) as rows, array_agg(id order by created_at) as ids
  from "User"
 group by 1 having count(*) > 1
 order by rows desc;
```

Expected result on 2026-11-16 data: zero rows. Non-zero means stop and follow the merge
sequence below instead of applying 0029.

## Merge sequence, if duplicates ever appear

Never delete an account. The point is to keep every row's data reachable.

1. Freeze: note the timestamp, and stop onboarding writes for those addresses.
2. Choose the survivor explicitly: the account with the most recent successful sign-in,
   not the oldest id. Record the reason per pair.
3. Re-point dependent rows to the survivor, in this order, inside one transaction:
   `Chat."userId"`, `Document."userId"`, `Message_v2` (through its chat), `AgentMessage."userId"`,
   `OrganizationMember."userId"`, `Subscription."organizationId"` (only if the duplicate pair
   also owns separate organisations), `UsageEvent."userId"`.
4. Keep the loser as a tombstone: set its email to `merged+<id>@invalid` rather than deleting
   it, so password-reset links and audit references still resolve, and record
   `mergedInto = <survivor id>` in a note row.
5. Verify: the group query returns zero rows, and the survivor's chat and document counts
   equal the sum of both accounts before the merge.
6. Only then run 0029.

Step 4 is the one that must not be skipped. A deleted row breaks the audit trail, and this
system keeps `UsageEvent` and `PaymentLog` rows that reference it.

## What 0029 does after that

It adds the unique index and the `EmailVerificationToken` table. Once it is in place, a
race between two registrations ends at the database rather than at whichever request
happened to finish first, and this document becomes historical.

## Status

Remediation **not required** on current data. Nothing deleted, nothing merged, no
production migration applied. The merge sequence is prepared for the case where the group
query stops returning zero, and it will be re-measured immediately before any migration run.
