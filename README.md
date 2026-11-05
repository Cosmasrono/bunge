# Nation Desk

Record your schedule and get reminded by email — 1 day, 5 hours, 1 hour and 15 minutes before
(or at the start time). Built with Next.js 16, MongoDB (through Prisma) and your own SMTP email account.

Also: send a PDF to a colleague to sign online (see **Documents** below).

Coming next: phone/computer push notifications.

---

## Run it on your PC

### 1. Get a MongoDB database (free, MongoDB Atlas)

1. Sign in at https://cloud.mongodb.com and create a free cluster (M0).
2. *Database Access*: add a database user with a password.
3. *Network Access*: allow your IP (and `0.0.0.0/0` if the app will run on Vercel).
4. *Connect → Drivers*: copy the connection string.
5. In `.env`, set `DATABASE_URL` to that string, and put **the database name** after the host:

   ```
   DATABASE_URL="mongodb+srv://USER:PASSWORD@CLUSTER.mongodb.net/nation-desk?retryWrites=true&w=majority"
   ```

   The part between `.mongodb.net/` and `?` is the database name (`nation-desk` above). Use a name only this app
   uses, **not** a database another app already uses (for example `bread`). If you leave it out, MongoDB uses `test`.

Atlas clusters are replica sets, which Prisma needs for MongoDB. (A plain local `mongod` won't work unless you
run it as a replica set, so Atlas is the easy route, also on your PC.)

### 2. Create the collections and indexes

```bash
npm install
npm run db:push
```

`db:push` makes the database match `prisma/schema.prisma` (MongoDB has no migrations). Before running it,
double-check the database name in `DATABASE_URL`. Run it again whenever the schema changes.

### 3. Start the app

```bash
npm run dev
```

Open http://localhost:3000.

- The first visit shows **Create your admin account**. The first account to sign up (and confirm its email) becomes the admin.
- Fill in your email credentials in `.env` (see below), then restart `npm run dev`.
- While running on your PC, reminders are checked automatically every 30 seconds.

### Email settings (`.env`)

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=you@gmail.com
SMTP_PASS=your-app-password
MAIL_FROM="Nation Desk <you@gmail.com>"
```

For Gmail, `SMTP_PASS` must be an **App Password** (Google Account → Security → 2-Step Verification →
App passwords), not your normal password. Other providers (Outlook, Zoho, your company mail) work too —
use their SMTP host and port (465 for SSL, or 587 for STARTTLS).

After restarting, go to **Settings → Send a test email**.

---

## Put it online with Vercel (free)

You need three free accounts: **GitHub**, **Vercel**, and **MongoDB Atlas**.

1. **Database** — Use the Atlas cluster from above (the same database as on your PC, or a second one such as
   `nation-desk-prod`). In Atlas *Network Access*, allow `0.0.0.0/0`, since Vercel has no fixed IP.
2. **Code** — Push this folder to a GitHub repository, then in Vercel choose *Add New → Project* and import it.
3. **Environment variables** (Project → Settings → Environment Variables):

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | your MongoDB Atlas connection string, including the database name |
   | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | from `npm run push:keys` (phone/computer notifications) |
   | `APP_URL` | your site address, e.g. `https://nation-desk.vercel.app` |
   | `APP_TIMEZONE` | `Africa/Nairobi` |
   | `CRON_SECRET` | a long random string (at least 16 characters) |
   | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | your email account |

   Make random values with: `node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"`

4. **Create the collections once.** The build doesn't change the database. If the online database differs from
   your PC's, point `DATABASE_URL` in `.env` at it, run `npm run db:push`, then switch it back.
   Then **deploy**.
5. Open your site straight away and create the admin account (the first account becomes the admin).

### Reminders every minute (cron-job.org)

Vercel's free plan only runs scheduled jobs once a day (that is set up as a backup in `vercel.json`).
For on-time reminders, use the free service **cron-job.org**:

1. Create a free account → *Create cronjob*.
2. URL: `https://YOUR-SITE/api/cron/reminders`
3. Schedule: **every 1 minute**.
4. *Advanced → Headers*: add `Authorization` = `Bearer YOUR_CRON_SECRET`
5. Save. Within a minute, **Settings → Reminder checker** in the app should show *Running*.

Without the correct secret the URL answers `401 Unauthorized`, so nobody else can trigger it.

---

## Look and sign-in background

Brown is the brand colour and pink the accent (colour tokens at the top of `src/app/globals.css`; light and dark mode
both meet WCAG AA text contrast). The sign-in pages sit on a full-screen background under a dark overlay. Until a photo is
set, it is a brown-to-pink gradient.

To use a photo (one you took, or one licensed for reuse):

```bash
npm run image:landing -- "C:path	ophoto.jpg" --credit "Photo: Name, CC BY-SA 4.0" --alt "Bunge Tower, Nairobi"
```

This makes a compressed WebP (about 200 to 450 KB for desktop, a smaller one for phones) in `public/images/`, and shows the
`--credit` line on the page. Creative Commons photos need that credit; leave it out only for your own photo.

## People, roles and invitations

There are two roles:

- **Admin**: creates accounts on the **Team** page, can add events to anyone's schedule, can open and edit anyone's events,
  and sees **Settings**. The first account (created on the setup page) is an admin.
- **Director**: sees and manages their own schedule. Events an admin adds for them show up in their schedule with
  "Added by …", and they get the reminders. They can change or turn off reminders on any event on their schedule.

**Adding a person:** an admin opens **Team**, enters name, email and role. The person gets an email with a one-time link
(valid for 48 hours). The link opens a page where they choose their own password and are signed in. **No password is ever
emailed.** The same page handles forgotten passwords: **Resend invite** / **Send reset link** on the Team page sends a fresh link.

Public sign-up is **off** by default, because accounts are created by an admin. To let anyone register themselves
(they become directors), set `ALLOW_PUBLIC_SIGNUP=true`.

**Admin viewing a director's schedule:** on the Schedule page, the admin sees a row of names above the events. Pick a
director to see their schedule, and **New event** then adds to theirs. When creating an event you can also choose
*Whose schedule?* from the form.

## Notifications (phone and computer pop-ups)

Reminders go out two ways: a **push notification** to every phone or computer the person turned it on for, and an
**email** (the backup, and the only way for people who didn't turn notifications on). Tapping a notification opens the event.

Set up once (admin):

1. Create a key pair and put both lines in `.env` (and in Vercel's environment variables):
   ```bash
   npm run push:keys
   ```
   `VAPID_PUBLIC_KEY=...` and `VAPID_PRIVATE_KEY=...`. Optionally set `VAPID_SUBJECT` to `mailto:you@yourcompany.com`
   (push services use it to contact you about misuse; Apple's service can reject made-up addresses).
2. Each person opens **Account → Notifications → Turn on notifications** on each device they want pop-ups on, and allows the browser question.

Good to know:

- Notifications need **HTTPS**. They work on `http://localhost` on the computer running the app, but a phone can only use them
  once the app is online (for example on Vercel) or reachable through an HTTPS address.
- **iPhone**: Apple only allows notifications for sites added to the Home Screen (iOS 16.4 or newer). In Safari tap
  Share → **Add to Home Screen**, open Nation Desk from the new icon, then turn notifications on. The Account page tells iPhone users this.
- Reminders are checked about every minute by a scheduled job (see *Reminders every minute* above). On your own PC, the built-in
  checker runs every 30 seconds while `npm run dev` / `npm start` is running, so the computer must be on. Online, use the cron
  URL with `CRON_SECRET`.
- If a device stops being reachable (the app was uninstalled, permissions removed), it is dropped automatically.

## Documents (send a PDF to be signed)

Admins and directors can send documents to each other (and to themselves, to try it out).

1. **Documents → Send a document**: upload a PDF (up to 10 MB, not password-protected), choose who should sign it
   and add an optional message. The person gets an email.
   **Mark where the signature goes:** the form shows the PDF's pages; pick the page and click the signature line
   (Small / Medium / Large sets the size). The signature is then stamped exactly there, with a small
   "Signed electronically by … · see last page" line under it. Pages turned sideways aren't supported for this.
2. They open **Documents**, read the PDF, then **draw or type** their signature, tick the consent box and submit.
   They can also decline and give a reason.
3. The app adds a **signature certificate page** to the PDF (signer, time, IP address and a SHA-256 fingerprint of
   the original file). The sender is emailed and can download the signed copy. The sender can cancel while it is
   still waiting.

Only the sender and the signer can open a document. Everything is recorded in the audit log.

- The PDFs (original and signed) are stored **in the MongoDB database** (`stored_files` collection), so documents work the
  same on your PC and on Vercel, and are included when you back up the database. Run `npm run db:push` once after updating.
- Upload limit: **10 MB** on your PC, **4 MB** on Vercel (Vercel refuses requests over 4.5 MB). MongoDB Atlas's free tier
  holds 512 MB in total, which is plenty for typical PDFs (100 KB to 2 MB each); move to a paid tier if you store many large files.
- Documents created by an older version on your PC (saved in `C:\Users\<you>\.nation-desk\documents\`) still open on
  that PC. File storage lives in `src/lib/storage.ts` if you later want Vercel Blob, S3 or R2 instead.
- **Signing details are recorded as proof**, with the signer's consent (a tick box before signing): the time and IP address
  (recorded by the server), and the browser, device info, time zone, a per-device ID and the GPS **location** (reported by the
  signer's device; the browser asks permission). They are printed on the certificate page and shown under *How it was signed*.
  A **MAC address cannot be collected**: browsers can't read it and it never leaves the local network. The device ID is the substitute.
  Set `REQUIRE_SIGNER_LOCATION=true` to refuse signing when location is declined.
- This is a simple electronic signature (a confirmed, logged-in user who agreed to sign), fine for everyday approvals.
  It is not a certified digital signature.
- After updating the code, run `npm run db:push` once to create the `documents` collection.

---

## Security

- **Passwords** are hashed with argon2id (never stored readable). At least 10 characters; common passwords are refused.
- **Sessions** live on the server. The browser only holds a random token in an `HttpOnly`, `Secure`, `SameSite=Lax`
  cookie (`__Host-` prefixed online), so scripts can't read it. Sign-out ends the session everywhere it's
  used; changing your password signs out your other devices. Sessions end after 14 idle days (30 days at most).
- **Brute-force protection**: 5 wrong attempts per email (30 per IP) in 15 minutes locks sign-in for 15 minutes.
  The error message is the same whether or not an email exists.
- **First admin** is whoever creates the first account (email confirmed with a code); after that, the setup page is closed.
  So on a new online deploy, create your account right away.
- **Password reset** links work once and expire after 1 hour; only a hash of the link is stored.
- **Every page and action** re-checks who you are on the server; you can only see and change your own events.
- **CSRF**: Next.js Server Actions only accept same-origin POST requests.
- **Browser protections**: strict Content-Security-Policy with a fresh nonce per request (only our own scripts run),
  no framing (clickjacking), `nosniff`, HSTS.
- **Audit log** of sign-ins, failures, password changes and resets (`audit_log` collection).
- Secrets live only in environment variables — never in the code or the database.

## Useful commands

| Command | What it does |
|---|---|
| `npm run dev` | Run on your PC |
| `npm run typecheck` / `npm run lint` | Check the code |
| `npm test` | Check the time-zone and repeat logic |
| `npm run push:keys` | Print a new key pair for phone/computer notifications |
| `npm run db:push` | Create/update collections and indexes after changing `prisma/schema.prisma` |
| `npm run db:generate` | Regenerate the Prisma client (also runs on `npm install` and `npm run build`) |
| `npm run db:studio` | Browse the data in Prisma Studio |
