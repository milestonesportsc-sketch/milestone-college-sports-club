# Systems architecture and design

## Picture

```
  Visitor / member phone or PC                      Admin phone or PC
  index.html (website, 3D arena, Sabiha)            admin.html -> dashboard.html, site-editor.html, status.html
            |   public API (no login)                         |   signed-in API (Bearer token)
            |   GET /api/public,              |   POST /api/login, GET/PUT /api/state,
            |   POST /api/contact, POST /api/client-error     |   /api/users, /api/status, /api/metrics
            v                                                 v
   +-------------------------------- server.js (Node.js, no npm packages) ---------------------------------+
   |  security headers -> request id -> rate limiter -> router -> logger/metrics                           |
   |  static files (allow-list, ETag, brotli/gzip, ranges)      API (JSON)      error tracking / audit log |
   +-----------------------------------------------+-----------------------------------------------------+
                                                   |
                          DATA_DIR/  mcsc.db (SQLite)   uploads/ (photos)   logs/ (app.log, error.log)
```

## How data flows

1. **Visitor sends a message:** the contact form goes to `POST /api/contact`. The server cleans and validates it
   and puts it in an *inbox* table. (Membership has no form: the website shows the fee and the bKash number only.)
2. **Admin opens the dashboard:** `GET /api/state` merges the inbox into the club data (messages) in one database transaction and returns only the lists that role may see (President and Editor only). The dashboard also checks for news every 20 seconds.
3. **Admin edits anything:** the dashboard saves to its browser copy and, 0.7 seconds later, sends the whole
   club data to `PUT /api/state`. Photos are turned into real files in `uploads/` (type checked, 4 MB max).
4. **Everyone else:** `GET /api/public` returns only what is public (published events and notices, team,
   photos, public settings). Passwords and unpublished items never leave the server.

Why this shape: the original dashboard keeps all data in one document, so the server stores that same
document. It keeps the dashboard code unchanged while making the data shared, durable and protected.
The inbox exists so a visitor's request can never be overwritten by an admin saving at the same moment.

## Decisions

| Topic | Decision | Reason |
|---|---|---|
| Dependencies | none (Node built-ins only) | nothing to install or patch; works offline |
| Database | SQLite (`node:sqlite`, Node 22.5+) in WAL mode | one file, easy backup, plenty for a club |
| Passwords | scrypt with random salt | memory-hard, built into Node |
| Sessions | HMAC-signed token, 8 h expiry, per-user version | password change or logout kills old tokens |
| CSRF | token in `Authorization` header, no cookies | browsers do not send it automatically |
| Roles | `dba` (accounts, backups, database, server), `president` (members, events, payments, budget, team, messages, fee/payment numbers), `editor` (website text, theme, gallery, announcements). The server sends each role only its own lists and merges only the lists/settings it owns on save | least privilege, separate dashboards |
| Rate limits | 300 API calls/min/IP, 20 logins/15 min, 5 wrong passwords per user+IP, 6 forms/hour | stop guessing and spam |
| Caching | HTML revalidates (ETag), css/js 5 min, images 1 day, uploads forever, `/api/public` 15-30 s | fast repeat visits, CDN friendly |

## Scaling: what is ready and what is not

* The server keeps no session in memory, so it can be restarted or moved at any time. Docker image and
  health check are included.
* `WEB_CONCURRENCY=2` (or more) starts several workers on one machine. They share the SQLite file safely,
  but rate-limit counters and `/api/metrics` are per worker.
* **Not ready:** running on several machines. That needs a shared database (PostgreSQL) and a shared rate-limit
  store (Redis). Do this only if traffic truly grows; one small server handles thousands of visits a day.

## Known limits (please read)

* **Payments are not automatic.** Members send the fee to the club's bKash number; the admin checks the wallet app and records the payment in the dashboard. Automatic checking needs a merchant account and the provider's API.
* The page security policy allows inline scripts because the website is one big HTML file. Moving scripts into
  files and using nonces would make it stricter.
* The dashboard sends the whole club data on each save (fine for hundreds of members, not for tens of thousands).
* Sample data created by the demo is marked as sample; use Dashboard > Settings > "Remove all sample data" before going live.

## Treasury (v3.4)
`treasury.js` is mounted at `/api/treasury/*`. Tables: `t_payments` (member submissions), `t_ledger` (append-only, hash-chained credits/debits per wallet), `t_requests` + `t_approvals` (withdrawal, unfreeze and limit-change requests, sealed by hash, one approval per role), `t_reconcile` (real-wallet comparisons), `t_audit` (append-only, hash-chained), `t_settings` (membership switch, freeze flag, limits). Balance is always `SUM(ledger)`. Every state change and its audit row are written in one `BEGIN IMMEDIATE` transaction. Gateway adapter: `createApp({ treasuryGateway })`.
