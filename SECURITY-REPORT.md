# Security check report (v3.4, 13 Nov 2026)

Tested locally against a temporary database (not the live Render site).

| Area | How tested | Result |
|---|---|---|
| Automated suite | `npm test` | 64 / 64 pass |
| Real-browser XSS | `npm run test:xss`, 9 pages incl. President, Secretary, Treasurer | pass, no script ran |
| Attack-style checks | `npm run test:pentest` | 87 / 87 pass |
| Sign-in and dashboards | Real Chromium, all 6 roles | each lands on own page, 0 JS errors; wrong-role pages bounce back |
| Permissions | each role reads and overwrites every list | each role gets and changes only its own lists |
| DBA control / account protection | create, change role, disable, reset password, self-protection, mass assignment | pass; old tokens die on role change, disable, logout |
| SQL injection | login, contact form | no effect, tables intact |
| Files / path traversal | 19 sensitive paths (.env, server.js, db, tests, backups...) | all 404 |
| Image uploads | fake PNG, HTML-as-PNG, SVG, PDF-as-JPEG, 4 MB+, `javascript:` and `../` sources | all rejected or neutralised; uploads served with image type + nosniff |
| Backup / restore | create, download, restore, wrong role, no confirmation | pass; restore keeps accounts, makes a safety copy |
| Private data | public API, per-role state, users list, SMTP password | no leaks |

## Fixed in this version
1. Coordinator dashboard header said "Club President" (page title, name, menu group). Now "Event & Sports Coordinator".
2. `/api/public` sent team and gallery items with every field. It now sends only the fields the website uses (`PUB_TEAM`, `PUB_GALLERY` in server.js).
3. README test count 51 -> 57; pentest test added.

## Notes
* There is no PDF or general file upload. Only images (PNG/JPEG/WebP/GIF, max 4 MB, checked by file header).
* Leader phone numbers in Leadership Team are public by design (Sabiha reads them out).
* Without the `SECRET` variable the token-signing key is stored in the database and so also in backups. render.yaml sets SECRET, so keep that.
* Backups hold password hashes and personal data: keep downloaded copies private.

## Still to do after you go live (cannot be tested from here)
* Open the Render address: padlock, http redirects to https, then run https://securityheaders.com
* Set `TRUST_PROXY=1`, a long `ADMIN_PASSWORD`, `PUBLIC_URL`, SMTP settings in Render, and confirm a forgot-password email arrives.
* Turn on Render disk snapshots and download a backup once. Test a restore on the live site.
* Sign in as each role on the live site once.
* This is a thorough local test, not a paid external penetration test.

## Treasury (new in v3.4) - what is enforced and what is not
Enforced by the server and covered by `tests/treasury.test.js` (7 tests): three distinct roles must approve each payout (password re-entered); sealed requests; idempotency key and 24 h duplicate guard; ledger-based balance with reservation; one-time and daily limits (changing them needs three approvals); live or recent real-wallet balance check before each payout; automatic freeze on mismatch, failed integrity check or bad payout; manual freeze by any officer; unfreeze needs three approvals; membership switch limited to President/DBA; append-only hash-chained ledger and audit log (database triggers + chain check); approvals void if an approver is disabled or changes role; double-click race pays once.

Not covered / your responsibility:
* **No real gateway is connected.** bKash/Nagad merchant credentials were not available, so `verifyPayment`, `balance` and `payout` are an adapter interface (see `treasury.js`), tested only with a mock. Until you write and test a real adapter, incoming payments are verified by two officials and payouts are made by hand in the real wallet.
* A person with direct access to the database file AND the ability to recompute hashes can rewrite history; keep off-site copies of backups and run the integrity check.
* Three colluding officers can approve a payout; the limits and audit log bound and record it, they do not prevent it.
* The Treasurer's manual statement amounts are only as honest as the statement they read: do the real-wallet comparison regularly.
* Rocket is not accepted by the Treasury (bKash and Nagad only), per the requirement.
* Not penetration-tested by a third party; browser XSS/pentest scripts (`test:xss`, `test:pentest`) were not re-run for the new pages.
