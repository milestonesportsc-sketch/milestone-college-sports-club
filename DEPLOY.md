# Put the site online (cloud hosting, CDN, CI/CD)

Nothing here has been deployed for you. These are the exact steps, and the files they use are already in the project.

## 1. Run it on your computer first
```
node -v            # must be 22.5 or newer
copy .env.example .env     (Windows)    cp .env.example .env     (Mac/Linux)
# edit .env: set ADMIN_PASSWORD to a long password
npm start
```
Open http://localhost:8080 . Sign in (everyone): http://localhost:8080/admin.html . Server health: http://localhost:8080/api/health
If you do not set ADMIN_PASSWORD, a random password is printed once in the terminal on the first start.
Lost the password? Another Database Administrator can reset it in the dashboard, or on the server: `node scripts/admin.js reset-password milestonesportsc@gmail.com "NewStrongPass1"`.
First accounts from the command line: `node scripts/admin.js create-user president@example.com president "TempPass123" "Full Name"`.

## 2. Version control (Git + GitHub)
The project is already a Git repository with a first commit. To put it on GitHub:
create an empty repository on github.com, then
```
git remote add origin https://github.com/YOUR-NAME/milestone-sports-club.git
git branch -M main
git push -u origin main
```
`.gitignore` keeps passwords (`.env`), the database and photos (`data/`) out of Git.

## 3. Cloud hosting (Render.com, simplest)
1. Create an account at render.com and choose **New > Blueprint**, pick your GitHub repository.
2. Render reads `render.yaml` (Docker, health check, 1 GB disk for `/data`). Type the `ADMIN_PASSWORD` when asked.
3. After the first deploy, open the `onrender.com` address. A persistent disk needs a paid plan; without a disk the
   data is erased on every deploy. Any host that runs Docker or Node 22 (Fly.io, Railway, a VPS) also works:
   set `DATA_DIR` to a folder that survives restarts and `TRUST_PROXY=1`.
4. Add your own domain in the host's dashboard; HTTPS certificates are automatic. The server also redirects any plain-http
   page request to https (health check exempt; turn off with `FORCE_HTTPS=0`).

### Checks to do ONCE right after the first deploy (before real members' data)
1. **Disk permission:** open the Render logs. You must see "Milestone Sports Club is running". The container starts as root only to
   give the `node` user the `/data` disk (`entrypoint.sh`), then runs the server as `node`. If you see `EACCES` or a crash loop, tell the developer.
2. **Persistence:** sign in, add a test member and a photo, press "Manual Deploy > Restart" in Render, sign in again: the test data must still be there.
3. **HTTPS:** open `http://YOUR-SITE/` - it must jump to `https://` with a padlock. Check https://securityheaders.com.
4. **Real visitor address:** sign in, then open Accounts & server > Activity log. The IP shown must be YOUR real address. If every
   user shows the same address (a Render/Cloudflare address), change `TRUST_PROXY` (1 or 2) in Render and check again.
   Otherwise the login lock and rate limits would be shared by everybody.
5. **Login lock:** type a wrong password 6 times; the 6th must say "Too many wrong passwords". Wait 15 minutes or reset it from the dashboard.
6. **Backups:** Render dashboard > the disk > turn on snapshots. Download one backup from the dashboard and keep it on your computer.

## 4. CDN (Cloudflare, free)
Add your domain to cloudflare.com and point it to your host, with the orange cloud ON. The server already sends the right
cache headers (ETag, `max-age`, `immutable` for photos), so Cloudflare will cache images and files close to visitors.
Set `TRUST_PROXY=2` (Cloudflare + host proxy) so rate limits see the real visitor address.
To serve Three.js yourself, put `three.min.js` and `OrbitControls.js` in `vendor/`.

## 5. CI/CD (GitHub Actions)
`.github/workflows/ci.yml` runs the syntax check, the 10+ automated tests and a Docker build on every push.
On `main` it can also deploy: in Render copy the **Deploy Hook URL**, and in GitHub open
Settings > Secrets > Actions > New secret, name `DEPLOY_HOOK_URL`. (Render's `autoDeploy` also works without this.)

## 6. Backups and monitoring
* The server makes an automatic daily copy of the database in `DATA_DIR/backups` (newest 30 kept). `npm run backup` writes to
  the same folder. These copies live on the SAME disk, so also download them (dashboard > Backups) and use Render's disk snapshots.
  Photos are in `DATA_DIR/uploads` (not inside the .db backup).
* `SECRET` (the key that signs login tokens) is generated once by Render (`generateValue`), so it is NOT inside the database or the backups.
* `status.html` (Database Administrator only) shows health, errors, logins and activity. `/api/metrics` is Prometheus format
  (use `METRICS_TOKEN` for UptimeRobot, Grafana Cloud, etc.). Point a free uptime monitor at `/api/health`.
* Logs are JSON lines in `data/logs/` (`app.log`, `error.log`, rotated at 5 MB) and in the host's log viewer.
* For a hosted error tracker (Sentry) the browser and server hooks are in `api-client.js` and `server.js` (`recordError`).

## Treasury
* Set limits, then do a first "Compare with the real wallet" for bKash and Nagad before any payout.
* To connect bKash/Nagad: implement an adapter `{ verifyPayment, balance, payout }` (see top of `treasury.js`), pass it as `treasuryGateway` in `createApp`, and test it with the sandbox of the provider before real money. Keep API credentials in environment variables, never in the repository.
* Restoring an old database file rewinds the ledger. After any database restore, freeze the treasury, compare with the real wallets, then unfreeze with three approvals.
