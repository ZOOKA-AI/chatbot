# Mail relay key rotation

**Date:** 2026-11-18. **Status:** overlap support implemented, rotation not executed. No secret was
changed, printed or committed.

The client now carries two candidates (`ZOOKA_MAIL_KEY`, then optional `ZOOKA_MAIL_KEY_NEXT`) and
retries only on 401/403, which is what makes the sequence below gap-free.

## Why this rotation is required

`lib/email/send.ts:7` on `main` still reads:

```
const RELAY_KEY = process.env.ZOOKA_MAIL_KEY; // the fallback literal was removed; the value lives in Vercel only
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
2. **Stage the new key beside the old one in Vercel.** Add `ZOOKA_MAIL_KEY_NEXT` = K2 in
   Production, Preview and Development, leave `ZOOKA_MAIL_KEY` = K1, then redeploy. The relay
   still holds K1, the app still sends K1, mail keeps flowing. Nothing is broken yet.
3. **Switch the relay to K2** (Base44 app secrets / function environment). From this second the
   app's first attempt with K1 is refused with 403 and the second candidate K2 succeeds, so mail
   keeps flowing with no gap. This is the whole point of the dual candidate: the relay needs no
   two-key support and no low-traffic window is required.
4. **Verify with a real mail.** Trigger a password reset for the verification mailbox and
   confirm: the message arrives, the logo renders, and the link points at `https://zooka-ai.com`.
   The app log may show one `email relay rejected a candidate key, trying the next one 403` line
   per send; that line is the expected overlap signal, not a failure.
5. **Promote K2.** Set `ZOOKA_MAIL_KEY` = K2, delete `ZOOKA_MAIL_KEY_NEXT`, redeploy. The
   per-send 403 warning disappears and only one key remains in the environment.
6. **Confirm K1 is dead.** `POST` the relay with K1 and expect **403 `forbidden`** (the value is
   never printed, only the status code is read).
7. **Record** the rotation date here and in the release notes. Never record the value.

## Rollback

With both candidates in the environment, rollback is a single change in either direction: put the
relay back on K1, or set `ZOOKA_MAIL_KEY` back to K1 and redeploy. Because the client always offers
two keys, one of them still matches the relay at every moment, so a wrong rotation costs one failed
attempt, not a send window. No data is at risk either way.

## Follow-ups this does not cover

- `lib/email/base.ts` chooses the canonical origin; a wrong `BASE` produces a working mail with
  a broken link, which no key rotation detects. It has its own tests.
- The relay function itself has no rate limit visible from outside; a leaked key is a mail-bomb
  vector. Rotating the key closes access, adding a per-caller quota closes the class.

## Why not two accepted keys on the relay

The relay is a Base44 function in this agent's own app and it validates a single shared key
(`POST` with no key or a wrong key returns `403 {"ok":false,"error":"forbidden"}`). Teaching it to
accept a set would mean editing and redeploying the one component every transactional mail depends
on, for a benefit the client-side candidate already delivers. Keeping the relay single-key and
dumb is the smaller, reversible change.
