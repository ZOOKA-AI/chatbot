# Credential hygiene: local Git remote

Measured 2026-11-16. No secret value is reproduced in this document or in any commit.

## What was wrong

The local clone at `conversations/.../igwt` had an access token embedded in the `origin` remote URL
(`https://<token>@github.com/ZOOKA-AI/chatbot.git`). Anyone with read access to that working copy, or to a
backup of it, held a GitHub credential for the repository. The repository's own content was never affected:
the credential lived in `.git/config`, which is not committed.

## What was done

1. The token was read from the remote URL into a shell variable and written to the agent's secret store
   (`/app/.agents/.env`, `GITHUB_PUSH_TOKEN`, mode 600) without being printed. It styles no report and no commit.
2. The remote was rewritten to the plain URL: `https://github.com/ZOOKA-AI/chatbot.git`.
3. Verified afterwards: `git config` holds zero credential-bearing entries and no file under `.git/` matches
   the token prefix.

## What is still required, by the owner

The token has not been rotated. Removing it from one working copy does not invalidate it, and it has been
present on disk for some time.

| Step | Where | Why |
| --- | --- | --- |
| Revoke the current fine-grained token | GitHub → Settings → Developer settings → Tokens | It is the only way to make the leaked copy useless |
| Issue a replacement scoped to `ZOOKA-AI/chatbot` | same screen | Least privilege: `contents:read/write`, `pull_requests:read/write`; no `workflow` scope unless workflows need pushing |
| Store the replacement in the secret store, not in a remote URL | agent secrets / Vercel env | Keeps it out of `.git/config` and out of shell history |
| Re-clone or `git remote set-url` on any other working copy | other machines | The same embedded pattern may exist elsewhere |

## Why this is not a release blocker for Preview

Preview acceptance reads no credential from the working copy: the deployment uses Vercel environment
variables, and the build does not touch `origin`. The item is a hygiene failure of the development
environment, not a path through which a customer could reach data. It is recorded here so the owner can
rotate before the repository is handed to anyone else, and so the next session does not rediscover it by
finding the token again.
