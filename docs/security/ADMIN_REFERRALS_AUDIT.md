# `/admin/referrals` access audit

## Conclusion

The referral report is cross-tenant by design. Affiliate codes belong to the
platform, and `getReferralReport()` aggregates every partner code and referral
event, so tenant-scoping the report would make it incomplete.

The tenant coverage exemption for `app/admin/referrals/page.tsx` is valid
because the route is protected by the platform-role gate rather than a tenant
transaction. The page requires an `admin` grant, and `requirePlatformRole`
loads that grant from the database on each request and fails closed if the
lookup fails. This gate replaces the former email allowlist and backup token in
the query string.

Partner writes are handled by `app/admin/referrals/actions.ts`. The server
action requires a `super_admin` grant, validates the submitted values, records
an audit event, and revalidates the report. The change is submitted through a
POST-backed server action rather than a GET query parameter.

The role policy and the administrator entry-point gates are covered in
`tests/unit/platform-role.test.ts`. The role check runs while rendering the
page, so an unauthorized request receives the page's denial content with the
default success status; changing that response status requires a pre-render
proxy gate and is outside this audit.
