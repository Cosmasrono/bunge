# PRS

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
MAIL_FROM="PRS <you@gmail.com>"
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

There are three roles:

| | Own schedule, sign documents | Schedule for others | Send documents | Team page (people, permissions) | Settings, change roles |
|---|---|---|---|---|---|
| **Admin** | yes | yes | yes | yes | yes |
| **Director** | yes | yes | yes | yes (creates staff) | no |
| **Staff** | yes | if allowed | if allowed | no | no |

A director or admin gives a staff member a permission on the **Team** page: each staff row has two switches,
**Schedule for others** and **Send documents**. They can also be ticked when inviting. The first account (created on the
setup page) is an admin. Only admins create admins or directors, and change roles (the last admin can't be demoted).

Events added to someone else's schedule show up there with "Added by …", and that person gets the reminders. They can
change or turn off reminders on any event on their schedule.

**Adding a person:** an admin or director opens **Team**, enters name, email and role. The person gets an email with a
one-time link (valid for 48 hours). The link opens a page where they choose their own password and are signed in. **No
password is ever emailed.** **Resend invite** / **Send reset link** on the Team page sends a fresh link.

Public sign-up is **off** by default, because accounts are created on the Team page. To let anyone register themselves
(they become staff), set `ALLOW_PUBLIC_SIGNUP=true`.

**Viewing someone's schedule:** people who may schedule for others see a row of names above their Schedule. Pick a person
to see their schedule; **New event** then adds to theirs. The event form also has *Whose schedule?*.

**Events for everyone:** in *Whose schedule?* choose **Everyone**, **All directors** or **All staff**. The event is put on each
of their schedules (one copy each, at the same moment, shown in each person's time zone), and each person gets a notification
(pop-up, push and email) and their own reminders. Opening any copy later offers **Apply these changes for everyone** (each
person keeps their own reminder settings) and **Delete for everyone** (everyone is told it was cancelled).

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
  Share → **Add to Home Screen**, open PRS from the new icon, then turn notifications on. The Account page tells iPhone users this.
- Reminders are checked about every minute by a scheduled job (see *Reminders every minute* above). On your own PC, the built-in
  checker runs every 30 seconds while `npm run dev` / `npm start` is running, so the computer must be on. Online, use the cron
  URL with `CRON_SECRET`.
- If a device stops being reachable (the app was uninstalled, permissions removed), it is dropped automatically.

## SMS messages (through MobileSasa)

Reminders, documents to sign and "added to your schedule" alerts go by SMS to anyone with a saved mobile number.

1. In your MobileSasa account, open **API Tokens** and create a token with the **Send messages** permission. It starts with `mbs_` and is shown only once.
2. Add `MOBILESASA_API_TOKEN` to `.env` (and Vercel). Add `MOBILESASA_SENDER_ID` once you have an approved sender name; without it, `MOBILESASA` is used. Then restart.
3. Each person's number is saved at sign-up or invite, or under **Account → Notifications**, where **Send a test SMS** checks it.

MobileSasa refuses an identical message to the same number twice in one day (the Message log shows this as a failure). Messages are cut to one SMS (160 plain characters) to keep the cost down.

**Message log:** admins can see, under **Settings → Message log**, whether each notification's email and SMS went out, with the reason for any failure. Entries are kept for 90 days. "Sent" means the email server or MobileSasa accepted the message; it doesn't confirm it reached the person.

## Documents (send a PDF to be signed)

Admins and directors can send a document to one or more people to sign (including themselves, to try it out).

1. **Documents → Send a document**: upload a PDF (up to 10 MB, not password-protected), tick everyone who should sign
   (**Select all** ticks the whole team) and add an optional message.
   **Mark where each signature goes:** the form shows the PDF's pages; with several signers, pick a name under
   *Placing for* (or just click: it moves to the next person after each click) and click their signature line.
   Small / Medium / Large sets the size. Pages turned sideways aren't supported for this.
   **Or let each signer choose:** anyone you don't mark must click on the document where their own signature goes
   before they can sign (for example the line above their name). A spot you marked is fixed: the signer sees it but
   can't move it.
2. **Signing deadline (optional):** tick *Add a signing deadline to everyone's schedule* and pick a date and time. Each
   signer gets a "Sign: …" event on their schedule with the usual reminders (1 day, 5 hours, 1 hour and 15 minutes
   before). The event is removed once they sign or decline, or when the document is cancelled.
3. **Notifications:** every signer gets a pop-up inside the app (bottom corner, within about 20 seconds while the app is open),
   a phone/computer notification if they turned notifications on (Account page), and an email. The sender gets the same as each
   signature comes in, and everyone is told when all have signed (or someone declined).
4. Each signer opens **Documents**, reads the PDF, then **draws or types** their signature, ticks the consent box and submits.
   **Sharing their location is compulsory**: the browser asks for it, and the Sign button stays off until it is shared.
   They can also decline with a reason, which closes the document for everyone.
5. When the last person signs, the app builds the signed PDF: every signature in its marked spot, plus a **signature certificate
   page for each signer** (time, GPS location and street address, IP address, device and a SHA-256 fingerprint of the original file).
   The sender can cancel while it is still waiting.

Only the sender and the signers can open a document. Everything is recorded in the audit log.

**Privacy between signers:** only the sender sees who else signs, everyone's progress, signatures, locations and IP
addresses, and downloads the complete signed PDF. Each signer sees only their own part, and their signed copy contains only
their own signature and certificate page. Emails to signers never name the other signers.

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
  Location is required: a signature without it is refused.
- This is a simple electronic signature (a confirmed, logged-in user who agreed to sign), fine for everyday approvals.
  It is not a certified digital signature.
- After updating the code, run `npm run db:push` once (it creates the `documents`, `document_signers` and `notices` collections).
  Documents sent before several signers were supported are moved over automatically the first time they are opened.

---

## Security

- **Passwords** are hashed with argon2id (never stored readable). At least 10 characters; common passwords are refused.
- **Sessions** live on the server. The browser only holds a random token in an `HttpOnly`, `Secure`, `SameSite=Lax`
  cookie (`__Host-` prefixed online), so scripts can't read it. Sign-out ends the session everywhere it's
  used; changing your password signs out your other devices. **Inactivity sign-out:** after 30 minutes without
  activity (clicks, typing, scrolling, mouse movement) you are signed out, with a one-minute warning and a **Stay signed in**
  button. Activity in any open tab counts for all of them; automatic page refreshes don't count. Change the time with
  `SESSION_IDLE_MINUTES` (for example `10`). Sessions always end after 30 days.
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
