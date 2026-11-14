# Private library and secure vault — disabled contract

Owner confirmed both personal content/files and API/password/OAuth credentials.
The MVP must not wait for this subsystem. `/private-library` is an informational
shell with disabled actions and no secret/file inputs, persistence, upload or
vault API. It is intentionally not a functional security product.

Keep private notes/files separate from credential records and retrieval/export
policies. Design authenticated encryption with managed key separation/rotation,
user/workspace binding, least privilege, reauthentication and actual MFA/recovery,
redacted sensitive-access auditing and session revocation. Developers must not
inherit secret-decryption privileges from their ability to change application
source. Define key-service trust, backup/restore, retention, deletion, access audit,
file scanning/signed retrieval and rate-limit policies before implementation.
A six-digit PIN is an additional unlock factor only, never the account credential
or encryption root. Do not store raw provider keys or password vault contents in
localStorage, JSON backups, analytics, model traces, chat or application logs.

Required acceptance: tenant/user isolation, encryption/key rotation and recovery,
MFA enrollment/reset abuse, step-up token/session binding, lockout/concurrency,
file content/size/access validation, audit coverage without secrets, export consent,
and operator break-glass governance. Do not call the shell a secure implemented
vault. No tables were created for it; inspect/reuse schema before adding entities.
