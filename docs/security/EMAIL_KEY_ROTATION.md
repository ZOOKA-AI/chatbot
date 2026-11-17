# Mail relay key rotation

**Date:** 2026-11-18. **Status:** planned, not executed. No secret was changed, printed or committed.

## Why this rotation is required

`lib/email/send.ts:7` on `main` still reads:

```
const RELAY_KEY = process.env.ZOOKA_MAIL_KEY ?? "zk-mail-2026-Qp7xV3";
```

The fallback value has been in git history since the file was committed, so it must be
treated as **compromised regardless of whether production also sets the variable**. Anyone
who can read the repository can call the relay with it. PR #110
(`fix/mail-relay-no-hardcoded-key`, draft) removes the fallback and makes the variable
mandatory, but removing it does not undo the exposure: the key itself has to change.

## What the relay is, measured

| property | value |
| --- | --- |
| endpoint | `https://solas-89d18e3d.base44.app/functions/zookaMail` (Base44 function in this agent's own app) |
| auth | request header carrying the shared key; `POST` with no key returns **403 `{"ok":false,"error":"forbidden"}`**, `GET` returns **405** |
| consumer | every transactional mail in Zooka: verification, password reset, receipts |
| other side of the secret | the Base44 app's function environment, not the repository |

So rotation touches **two systems in a fixed order**, and the repository is neither of them.

## Preconditions

1. PR #110 reviewed and merged (no fallback left in `main`).
2. `ZOOKA_MAIL_KEY` confirmed present in the Vercel **production** environment (the variable
   existed only as the hardcoded fallback before PR #110, which is how the outage happened).
3. A verification mailbox that is not a customer: `helmyharoon8@gmail.com`.

## Sequence

1. **Generate.** 32 characters, CSPRNG (`openssl rand -base64 24 | tr -d '/+=' | cut -c1-32`).
   It goes into the two dashboards, never into chat, a commit, a note or a log.
2. **Update the relay first** (Base44 app secrets / function environment) so it accepts the
   new value. If the function supports two accepted keys, keep the old one valid during the
   window; if it holds a single key, expect mail to fail from this step until step 4 and plan
   a low-traffic window, because password reset mail is the one flow that must not be down
   for long.
3. **Update Vercel production** `ZOOKA_MAIL_KEY` with the new value. Sensitive variables are
   entered in the dashboard, not through the API (the API reads them as empty).
4. **Redeploy production** and confirm the deployment is READY for the new commit.
5. **Verify with a real mail.** Trigger a password reset for the verification mailbox and
   confirm: relay returns 200, the message arrives, the logo renders, and the link points at
   `https://zooka-ai.com`.
6. **Retire the old key** in the relay as soon as step 5 passes.
7. **Record** the rotation date here and in the release notes. Never record the value.

## Rollback

Set `ZOOKA_MAIL_KEY` in Vercel back to the previous value and keep the old key accepted by the
relay, then redeploy. The cost of a wrong rotation is one failed send window, not data loss.

## Follow-ups this does not cover

- `lib/email/base.ts` chooses the canonical origin; a wrong `BASE` produces a working mail with
  a broken link, which no key rotation detects. It has its own tests.
- The relay function itself has no rate limit visible from outside; a leaked key is a mail-bomb
  vector. Rotating the key closes access, adding a per-caller quota closes the class.
