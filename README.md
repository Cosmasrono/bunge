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

## Documents (send a PDF to be signed)

Two roles: the first account is the **admin**; everyone who signs up afterwards is a **manager**. Admins and
managers can send documents to each other.

1. **Documents → Send a document**: upload a PDF (up to 10 MB, not password-protected), choose who should sign it
   and add an optional message. The person gets an email.
2. They open **Documents**, read the PDF, then **draw or type** their signature, tick the consent box and submit.
   They can also decline and give a reason.
3. The app adds a **signature certificate page** to the PDF (signer, time, IP address and a SHA-256 fingerprint of
   the original file). The sender is emailed and can download the signed copy. The sender can cancel while it is
   still waiting.

Only the sender and the signer can open a document. Everything is recorded in the audit log.

- Files are stored in `C:\Users\<you>\.nation-desk\documents\` (change with `DOCS_DIR` in `.env`). Back this folder up
  together with the database. The database only keeps the details, not the PDFs.
- **Online hosting (Vercel) is not supported yet** for documents: Vercel has no permanent disk. File storage lives in
  `src/lib/storage.ts`, the one file to swap for cloud storage (Vercel Blob, S3 or R2) later.
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
| `npm run db:push` | Create/update collections and indexes after changing `prisma/schema.prisma` |
| `npm run db:generate` | Regenerate the Prisma client (also runs on `npm install` and `npm run build`) |
| `npm run db:studio` | Browse the data in Prisma Studio |
