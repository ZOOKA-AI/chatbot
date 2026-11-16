# Preview database: what is proven, and what is missing

## The blocker, exactly

Phase 1 asked whether an approved free database exists that can be allocated to
Preview. The answer on 16 Nov 2026:

| Route | Result | Evidence |
|---|---|---|
| Supabase management API, project list | Works | `GET /v1/projects` → 200, one project: `krzfrsaquvmwctsajhlm` (production) |
| Supabase management API, organisations | **401 `JWT could not be decoded`** | Cannot read the org list, so cannot obtain the org id a create call needs |
| Supabase create project | Refused earlier with the free-project limit | Recorded 15 Nov; the same account holds a second free project outside this organisation |
| Neon / Railway / Turso / Render | No credential anywhere | Vault has one database entry, and it is the production Supabase pooler |
| Sandbox local PostgreSQL | Works, but private to the sandbox | `127.0.0.1:55432` is not reachable from Vercel, so it cannot serve a Preview deployment |

**The decision required from the owner, one of these three:**

1. Create a free Supabase project named `zooka-preview` (region `ap-southeast-1`)
   and set its pooler connection string as `DATABASE_URL_TENANT` on Preview only.
2. Create a free Neon database and provide its connection string the same way.
3. Issue a Supabase management token that can read organisations, so the project
   can be created from here instead.

No paid resource is proposed. Production is not involved in any option.

## The recipe, already proven

`scripts/preview-db-provision.sh` takes an administrative connection and a runtime
password, refuses known production hosts, applies the seven reviewed migrations in
the order that matters, sets the runtime password without printing it, and then
verifies two properties itself.

It was executed against a brand new database (`zooka_preview_sim`) in the sandbox
on 16 Nov 2026 and produced:

```
PASS role is restricted
PASS rls_on=5 rls_off=0
```

Synthetic data was then seeded (two workspaces, two agent identities, one task
each) and isolation was verified as the restricted runtime role:

```
PASS visible_to_A=1
PASS b_invisible=true
PASS visible_to_B=1
PASS b_task_untouched=true      -- A's UPDATE against B's row affected 0 rows
```

The full suite was then run against that freshly provisioned database:
**421 passed across 59 files**, identical to the development cluster.

So the database side is a ten-minute job once a connection string exists. The
script is committed so the run is repeatable and reviewable rather than
improvised.

## What still stands between here and a browser session

A database alone does not unlock Phase 4. Two further facts, both verified:

- every Preview path answers `302` to `vercel.com/sso-api`, and bypassing that is
  forbidden;
- Preview has its own `AUTH_SECRET`, and the Google OAuth client is registered for
  `zoka-ai.com` only, so a production session cannot be replayed and a Preview
  callback has no registered redirect URI.

Using a real Preview session therefore needs an owner decision too: either add the
Preview domain as an authorised redirect URI in the Google console, or accept
browser acceptance on production with a read-only test workspace instead.
