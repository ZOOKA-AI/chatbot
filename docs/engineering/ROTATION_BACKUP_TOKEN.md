# BACKUP_TOKEN rotation runbook

Not executed. Rotating a production secret is an owner decision.

## Consumers (exhaustive, verified by search)

| Consumer | Where it reads the token | Notes |
|---|---|---|
| The daily backup job | `.zooka_backup_token` inside a conversation folder, sent as `x-backup-token` | four copies exist: `6a59a371c2ba4e8b61701eff`, `6ae91d82506725d83eca3cf3`, `6aed11f6734224c00293b4d4`, `6af106ba9b46cb30c42850c0` — 48 characters each, mode 600 |
| The application | `process.env.BACKUP_TOKEN` in Vercel, production only | preview does not receive it |
| CI | none | no workflow exists (and the token cannot create one) |
| Repository | none | zero matches in tracked files |

## Exposure assessment

The secret is not in git. It is on the local filesystem of four sandboxes and in
Vercel. The realistic exposure is anyone with sandbox or Vercel read access, plus
any screenshot or paste that included it. Given that history, rotation is
recommended but not urgent-on-fire; treat the current token as semi-trusted.

## Steps

1. **Generate** a new 48-character random token (no prefixes, no words).
2. **Store** it in Vercel production env as `BACKUP_TOKEN_NEXT` (do not overwrite
   `BACKUP_TOKEN` yet).
3. **Dual-accept window (small code change, one line each):** accept either
   variable; deploy; confirm the old token still returns 200 and the new one too.
   Skip this step if a short backup outage is acceptable instead.
4. **Update consumers:** write the new token to `.zooka_backup_token` in the four
   conversation folders, then run the backup job manually and confirm 200 with a
   row count in the expected range.
5. **Revoke:** set `BACKUP_TOKEN` to the new value and delete
   `BACKUP_TOKEN_NEXT`; redeploy. Confirm the *old* token now returns 401 and the
   new one 200.
6. **Review:** grep the four folders for any other file containing the old value,
   and check stored transcripts/screenshots that may have captured it.

## Proof required before declaring done

- old token: 401 (body `{error: "unauthorized"}`)
- new token: 200 with a plausible `rowCount`
- backup artifact written to private storage, not public
- no console output containing the token at any point
