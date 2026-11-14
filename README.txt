PROJECT: Milestone Sports Club - a human-led, AI-assisted software engineering project (see PROJECT-STATEMENT.md).

=====================================================================
 MILESTONE COLLEGE SPORTS CLUB - WEBSITE + CONTROL PANEL (version 3.4)
=====================================================================

1. RUN IT (needs Node 22.5 or newer, no npm install)
   - Copy .env.example to .env and set ADMIN_EMAIL and a LONG ADMIN_PASSWORD (12+ characters, not a word or a name).
   - npm start
   - Website:        http://localhost:8080
   - Control panel:  http://localhost:8080/admin.html
   The site and the control panel need this server. Opening index.html directly as a file shows only a read-only
   preview of the website; nothing can be edited there and nobody can sign in.

2. SIGN IN
   Everyone signs in at admin.html and is sent to THEIR OWN page:
     dba.html (Database Administrator)  president.html (Club President)  secretary.html (General Secretary)
     treasurer.html (Treasurer)  dashboard.html (Event & Sports Coordinator)  site-editor.html (Editor)
   Who controls what (the server enforces this; see dba.html > Access Control):
     President:   members, events, payments, tour budget, team, messages + website text, gallery, announcements, fee/payment numbers
     Secretary:   members, team, messages + website text, gallery, announcements
     Treasurer:   payments, tour budget, fee/payment numbers, announcements
     Coordinator: events          Editor: website text, gallery, announcements
   The first start creates the main administrator from ADMIN_EMAIL / ADMIN_PASSWORD in .env. This one login opens:
     - Accounts & server (dba.html): user accounts, backups, database check, activity log, server health
     - Club dashboard (dashboard.html): members, events, payments, tour budget, leadership team, messages, fees
     - Website editor (site-editor.html): website text and theme, photo gallery, notices
   In "User Accounts" the administrator can add more people (Club President, Editor, Database Administrator).
   Each of them signs in with their own email and password and sees only their own dashboard.
   There is no default or demo login. Passwords are stored hashed; sessions end after 8 hours, on logout, on password
   change, and when an account is disabled. Repeated wrong passwords lock sign-in for 15 minutes.

3. FORGOT PASSWORD
   admin.html > "Forgot password?" > type the account email > a one-time link (valid 30 minutes) is emailed.
   Email needs SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / SMTP_FROM and PUBLIC_URL in .env
   (see .env.example; Gmail needs an "App password"). Without them the link is printed in the server terminal.
   Lost access with no email set up? On the server: node scripts/admin.js reset-password EMAIL "NewStrongPass1"

4. LEADERSHIP TEAM AND PHOTOS
   Club dashboard > Leadership Team > Edit > choose a picture. Leaders without a photo show a default picture.
   Club Leadership has 8 Teacher places and the Students Leadership Team.

5. PUT IT ONLINE, BACKUPS, TESTS
   - DEPLOY.md: hosting (Render, Docker), HTTPS, backups, Git.
   - ARCHITECTURE.md: how the server, database and permissions work.
   - npm test runs ALL automated tests (64): the API tests, the role tests, the security tests and the robustness tests (odd request bodies, old databases, broken SMTP) (SQL injection, XSS,
     CSRF, unauthorised access with every role, HTTPS/proxy settings, rate limiting across several servers).
   - npm run test:pentest runs 87 attack-style checks (DBA control, token forging, SQL injection, path traversal, headers, private-data exposure,
     backup/restore, image-upload attacks, brute force). Needs only Python. Results and open items: SECURITY-REPORT.md
   - npm run test:xss opens the site in a real Chromium browser and attacks every page with script payloads
     (needs: pip install playwright && playwright install chromium).
   - Rate limits and password lock-outs are kept in the database file, so several workers (WEB_CONCURRENCY) or several
     servers using the SAME data folder share one counter. Servers with separate disks do not share it.
   - HTTPS is done by your host (Render etc.); set TRUST_PROXY=1 so the site knows the request was https. Check your live
     address once after going online (padlock, and https://securityheaders.com).
   - Backups: the server makes one automatic copy of the database every day (newest 30 kept, in DATA_DIR/backups). npm run backup
     writes to the same folder. A copy on the SAME disk is not enough: download backups regularly (dashboard > Backups) and turn on
     Render disk snapshots. Photos are in DATA_DIR/uploads.
   - Keep .env and the data/ folder out of Git and out of any zip you share (.gitignore already does this).

5b. TREASURY (treasury.html; open it from the President, General Secretary, Treasurer or Administrator page)
   - Members pay by bKash or Nagad and send the TrxID on the website (Membership section). The club checks it; nothing is credited until verified.
   - Money IN: verified by the payment gateway adapter, or by TWO officials (Treasurer, then President/Secretary) who both type the real statement amount.
   - Money OUT: needs approval from the President AND the General Secretary AND the Treasurer (each re-types their password). Requests are sealed; a
     one-time limit (default 20000) and a daily limit (50000) apply; overdraw, double payment and reused wallet transaction IDs are refused.
   - Before every payout the server checks the REAL wallet balance (live from the gateway adapter, or a "Compare with the real wallet" done in the last 24 h).
     If the real wallet holds less than the ledger, the treasury freezes itself.
   - Emergency freeze: any of the 3 officers or the administrator. Unfreezing and changing limits need the same three approvals.
   - Membership on/off: President or Administrator only. Off = no new admissions or fee payments; old records stay.
   - Ledger and audit log are append-only and hash-chained; "Check ledger integrity" detects tampering and freezes.
   - IMPORTANT: the site holds no bKash/Nagad credentials and cannot move real money by itself. With the default manual adapter the Treasurer sends
     the money from the real wallet after the checks pass and records the wallet's transaction ID. See DEPLOY.md > Treasury to connect a real gateway.

6. SECURITY NOTE
   Scripts and style blocks run only if they are the site's own files or hash-approved; inline event attributes are blocked
   ('unsafe-inline' is allowed only for style="" attributes). The 3D arena needs vendor/three.min.js and vendor/OrbitControls.js
   (see vendor/README.txt) or an internet connection to the CDN (only those two exact files are allowed from jsDelivr); without both it shows the normal pictures instead.

7. NOT YET VERIFIED BY A HUMAN
   Docker build, real hosting with a persistent disk (and restoring a backup there), real phones and browsers, many users at
   the same time, and a professional security review. Do these before using real members' data in public.
=====================================================================

SABIHA VOICE FOLDER (sabiha/)
Offline Bangla voice tools for Sabiha (Python TTS/STT installers, browser voice helper, test page).
See sabiha/README.md. The browser helper is served at /sabiha/sabiha-voice.js.

CENTRAL SECURITY MANAGEMENT (Signed-in devices)
   Accounts & server > Security Center > "Signed-in devices" lists every phone, laptop and browser that is signed in
   (who, device, network, sign-in time, last activity). "Remove" signs that device out at its very next request;
   "Sign out every other device" removes all but yours. A device never seen before for an account is marked NEW, written
   to the Activity Log, and emailed to every account (needs SMTP_* in .env). Wrong-password alarm, siren, photo and email
   alerts work as before. Only the Database Administrator can see or remove devices.

ALERT EMAIL (set once, then automatic)
   Central Security Management > "Alert email": choose the provider (Gmail etc.), type the sender email and its App password,
   optionally extra alert addresses, press Save, then "Send test email". The password is stored encrypted and never shown again.
   After that every alarm, new-device notice and intruder photo is emailed automatically. SMTP_* in .env still works as a fallback.
BLOCK AND ALLOW
   Signed-in devices: Remove / Block device / Block device + network. Alarm list: Block this network / Block this device /
   Allow this person (unlock). Blocked devices: "Allow again" gives permission back. Every browser gets a private device id,
   so a blocked device is refused even from another network (clearing browser data or a private window gets a new id: use the
   network block as well when needed). Login history lists every sign-in with its IP, device and status.

6. SECURITY ALARM (v3.5)
   Security number: 01340340744 (default; change with ALERT_PHONE in .env). Set SMS_URL too, otherwise no text can be sent.
   Anyone entering a wrong password, an unknown email, a blocked device or a new unapproved device raises an alarm:
     - a text goes to the security number at once, then a reminder text every 3 minutes (up to 40) until it is stopped;
     - every signed-in page shows a red banner and repeats the siren every 7 seconds, even after a reload;
     - the intruder's photo (if the camera is allowed) is emailed to all admins and shown in the banner. A text message cannot carry a picture, so the text says the photo was emailed.
     - ONLY the Database Administrator or the Club President can press STOP ALARM. Other roles cannot hide it.

7. ALARM PHONES (v3.6): dba.html > Central Security Management > "Alarm phones"
   - Up to 3 security numbers (number 1 = 01340340744; two places reserved). Each can also have a Telegram chat ID.
   - SMS cannot carry a photo: create a Telegram bot with @BotFather, paste its token on that page, press Start on each phone,
     press "Find chat IDs", save. The intruder photo then arrives on the phone. Optional .env: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_IDS.

8. 3D ARENA (v3.7): new "Students" tab = close-up of a college break (uniform shirt, ID card + lanyard, school bags, football, friends chatting, a student waving, two passing a ball, others walking).
   Also: richer grass, sky with clouds, patterned football, more hair styles and face detail.
   The website runs the arena from a copy inside index.html. After editing arena.js, run:  node scripts/inject-arena.js
