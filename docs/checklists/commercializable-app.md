# Commercializable product checklist

Use this checklist when the commercial profile is on. Record `PASS`, `WAITING`, `BLOCKED`, or `N/A — <typed reason>` with an evidence path or URL. Universal rows cannot be N/A. Conditional rows can be N/A only when their capability flag is off.

## Universal commercial rows

| Stage | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Seller identity and jurisdiction are named |  |  |
| 1 | Offer, buyer, user, value, success metric, and kill criteria are explicit |  |  |
| 1 | Pricing hypothesis and channel to the first ten customers are recorded |  |  |
| 2 | Liability and regulated-use screen is complete |  |  |
| 5 | LICENSE or Terms of Service is selected for the actual distribution model; they are not treated as interchangeable |  |  |
| 5 | Privacy and Terms source is named: counsel or an identified service; agent-generated legal text is not accepted as final |  |  |
| 6 | Support path and ownership exist |  |  |
| 7 | Secret scan, dependency audit, rollback evidence, and release tests pass |  |  |
| 8 | Published policy URLs, version/changelog, support contact, and production rollback owner exist |  |  |
| 9 | Incident, support, and customer-communication owners are named |  |  |
| 10 | Deprecation and customer-notice process exists |  |  |

## Users and accounts

Required when the `users/accounts` flag is on.

| Stage | Requirement | Status | Evidence / N/A reason |
| --- | --- | --- | --- |
| 4 | Authentication, session, authorization, enumeration, and IDOR threats are modeled |  |  |
| 6 | Sign-in, logout, account management, export, deletion, and rate limits are implemented |  |  |
| 6 | Mutating routes use server-side default-deny authorization |  |  |
| 7 | Unauthenticated denial, cross-account IDOR, logout, and session-expiry tests pass |  |  |
| 9 | Authentication failures and account-abuse signals are monitored |  |  |

## PII and telemetry

Required when the `PII/telemetry` flag is on.

| Stage | Requirement | Status | Evidence / N/A reason |
| --- | --- | --- | --- |
| 3 | Data inventory, purpose, legal basis, retention, deletion, and subprocessors are recorded |  |  |
| 5 | Consent occurs before the first optional tracking event |  |  |
| 6 | Export and deletion paths are implemented |  |  |
| 7 | Consent, export, deletion, and retention tests pass |  |  |
| 8 | Privacy policy and subprocessor disclosure are live; observability scrubs PII |  |  |
| 9 | Data-subject request clock and owner are operational |  |  |

## Money

Required when the `money` flag is on. Live KYC and tax registration may be `WAITING`, never N/A.

| Stage | Requirement | Status | Evidence / N/A reason |
| --- | --- | --- | --- |
| 4 | Signature, replay, idempotency, test/live separation, and client-side price tampering are modeled |  |  |
| 5 | Tax responsibility or merchant-of-record decision is signed |  |  |
| 5 | Entitlement grant and revoke lifecycle is designed |  |  |
| 6 | Checkout and signed webhook handler are production implementations, not stubs |  |  |
| 6 | Duplicate events cannot double-grant; cancellation/refund revokes entitlement |  |  |
| 7 | Bad signature, replay, duplicate, price-tamper, grant, and revoke tests pass |  |  |
| 8 | Live price, KYC, receipts, refund policy, disputes, dunning, and tax/MoR are operational |  |  |
| 9 | Payment, webhook, refund, chargeback, and dunning failures alert an owner |  |  |
| 10 | Renewal pricing and customer-notice process exists |  |  |

## Public UI and accessibility

Required when the `public UI` flag is on.

| Stage | Requirement | Status | Evidence / N/A reason |
| --- | --- | --- | --- |
| 5 | Named shell themes preserve the existing default; accessible/high-contrast is opt-in |  |  |
| 6 | Semantic controls, names, focus behavior, keyboard access, contrast, and live status meet WCAG 2.2 AA on touched flows |  |  |
| 7 | Axe assertion and manual keyboard/critical-journey review pass; axe alone is not conformance |  |  |
| 8 | TLS and production accessibility paths are verified |  |  |
| 8 | VPAT/ACR is drafted when the regulated or government/enterprise pack requires it |  |  |

## Email

Required when the `email` flag is on.

| Stage | Requirement | Status | Evidence / N/A reason |
| --- | --- | --- | --- |
| 5 | Transactional and marketing mail are classified |  |  |
| 7 | Delivery, bounce, and unsubscribe paths are tested |  |  |
| 8 | SPF, DKIM, and DMARC are verified |  |  |
| 8 | Marketing mail has consent and unsubscribe |  |  |

## Hosting and operations

Required when the `hosting` flag is on.

| Stage | Requirement | Status | Evidence / N/A reason |
| --- | --- | --- | --- |
| 5 | RPO, RTO, health check, paging owner, and rollback design are named |  |  |
| 7 | Restore and rollback drills pass |  |  |
| 8 | Alerts cover availability, authentication, payment, webhook, and data-path failures as applicable |  |  |
| 9 | On-call, incident communications, patch cadence, and service objective are operational |  |  |

## Platform-specific rows

These are conditional and require a typed N/A reason when off: mobile IAP / RevenueCat, SSO, DPA, tenant branding, and paid Cursor Manager tier. Regulated obligations use `regulated.md`.

### Marketplace or Cursor Directory

Required when the `Marketplace/Directory listing` flag is on.

| Stage | Requirement | Status | Evidence / N/A reason |
| --- | --- | --- | --- |
| 4 | Host permissions, install scope, update path, and supply-chain threats are modeled |  |  |
| 6 | Manifest, assets, license, support URL, and install/uninstall behavior are verified |  |  |
| 7 | Package contents and every declared command, hook, rule, skill, permission, and asset are tested |  |  |
| 8 | Listing copy matches shipped behavior; review status and owner are recorded |  |  |
| 9 | Compatibility, support, rating/feedback, and host-policy changes have owners |  |  |

An existing approved listing is evidence. Recheck it when release behavior or metadata changes; do not resubmit an unchanged listing.
