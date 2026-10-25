# Deploying YARI Academy

One Ubuntu server runs everything in Docker: Caddy (HTTPS), the app, Postgres and ClamAV. No AWS services are needed. Uploaded files are stored on the server's disk, and the bootstrap script backs them up with the database every night.

The same script sets up two kinds of server:

| Mode                                                   | Use it for                    | What it does                                                                                                          |
| ------------------------------------------------------ | ----------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Live**: `sudo ./deploy/bootstrap.sh --live <domain>` | The real platform             | Real emails through Resend. Creates the first Super Admin's invitation. No demo data, ever.                           |
| **Demo**: `sudo ./deploy/bootstrap.sh [domain]`        | Presentations to clients only | Fictional people and data, a "demonstration site" banner on every page, and emails are never sent (`DEMO_MODE=true`). |

**Never use one server for both.** The script refuses to turn a demo server into a live one.

## 1. Get a server

You need Ubuntu 22.04 or 24.04, x86 or ARM, with **at least 4 GB of memory** (ClamAV alone uses about 1.5 GB), 2 CPUs and 30 GB of disk. To keep personal data in South Africa (see `docs/POPIA.md`), choose a data centre in South Africa.

### Option A: free, Oracle Cloud "Always Free" (Johannesburg)

The only free option that fits. It has a Johannesburg region, and its free ARM server is more than enough (up to 4 CPUs and 24 GB of memory).

- **Card:** a credit card is needed to sign up, for identity checks. Free resources aren't charged.
- **Home region:** you can't change it later, so choose **South Africa Central (Johannesburg)** when you sign up.
- **Availability:** free ARM capacity is sometimes "out of capacity". If so, try again later or in another availability domain.
- **Idle servers:** Oracle can reclaim free servers that sit idle for 7 days. A platform in daily use is fine. Upgrading the account to "Pay As You Go" (still free for these resources) removes that risk.

Steps:

1. Sign up at **oracle.com/cloud/free** with home region **Johannesburg**.
2. **Compute → Instances → Create instance:**
   - **Image:** Canonical Ubuntu 24.04.
   - **Shape:** Ampere `VM.Standard.A1.Flex`, with 2 OCPUs and 12 GB of memory (or 4 and 24).
   - **SSH keys:** download the private key and keep it safe.
   - **Boot volume:** 50 GB.
3. **Open the web ports in Oracle's firewall:**
   1. Open the instance's subnet, then its **Default Security List**.
   2. **Add Ingress Rules:** source `0.0.0.0/0`, TCP, destination ports `80,443`.
   3. Add one more for UDP port `443`.

   The bootstrap script opens the same ports in the server's own firewall.

4. **Reserve the public IP** (Networking → Reserved public IPs) and attach it to the instance, so the address never changes.

### Option B: a small paid server in South Africa

About R150–R400 a month, with no capacity or idle-server worries. Examples are Afrihost, Xneelo, Hetzner (Johannesburg) and Vultr (Johannesburg). Choose a plan with 4 GB of memory and Ubuntu 24.04, and allow ports 22, 80 and 443.

PythonAnywhere, Render's free tier and Vercel's Hobby plan don't fit:

- **PythonAnywhere:** Python only.
- **Render free tier:** sleeps when idle, and deletes its free database after a month.
- **Vercel Hobby:** for non-commercial use only, with no virus scanner.

## 2. Point the domain at the server

At whoever hosts the DNS for `yarigroup.co.za` (often the company the domain was bought from, or Cloudflare), add:

| Type | Name      | Value                             |
| ---- | --------- | --------------------------------- |
| A    | `academy` | the server's public IP (reserved) |

The platform is then at `https://academy.yarigroup.co.za`. Your email (Titan) is unaffected, because its MX records stay as they are.

The DNS host can't be found yet? Install with no domain for now. The script uses `<ip>.sslip.io`, which works at once with a real HTTPS certificate. See "Moving to the real domain" below.

## 3. Set up email (Resend)

1. Create an account at **resend.com**.
2. **Domains → Add domain:** `yarigroup.co.za`, region **Ireland (eu-west-1)**, the closest to South Africa.
3. Resend shows three or four DNS records (DKIM `resend._domainkey`, and SPF and MX on the `send` subdomain). Add them at the same DNS host. They don't touch Titan's records. Click **Verify**, which can take up to an hour.
4. **API Keys → Create:** permission _Sending access_, domain `yarigroup.co.za`. Copy the key (it starts with `re_`). You'll paste it into the server in the next step, never into chat or email.

Emails come from `YARI Academy <academy@yarigroup.co.za>`. To change that, edit `EMAIL_FROM` in `.env.production`.

## 4. Install

```bash
ssh -i <your-key> ubuntu@<server IP>
# The repository is private: use a GitHub fine-grained token with read-only access to it.
git clone https://github.com/bella9302/yari-lms.git yari && cd yari
git checkout claude/new-session-4cq1ta      # or main, once merged
sudo ./deploy/bootstrap.sh --live academy.yarigroup.co.za
```

The script asks for three things:

- the **first Super Admin's email**;
- their **full name**;
- the **Resend API key** (hidden as you type).

Then it:

1. installs Docker;
2. adds swap if memory is small;
3. opens the firewall;
4. writes `.env.production` with **fresh encryption keys**;
5. builds and starts everything (5–10 minutes the first time);
6. prints the **Super Admin's invitation link**;
7. schedules the nightly job and nightly backups.

Open the invitation link. It is valid for 7 days. Set a password and two-step verification. Then invite trainers and companies from **Admin → People**.

### Right after installing

1. **Save a copy of `.env.production`** in a password manager:
   ```bash
   sudo cat .env.production
   ```
   It holds the encryption keys (`FIELD_ENC_KEYS`, `BLIND_INDEX_KEY`) and the backup passphrase. If the server is lost without them, the personal data in every backup **can't be read**. Keep this copy separate from the backups.
2. **Copy backups off the server.** Every night at 02:30, an encrypted backup of the database and uploaded files goes to `/var/backups/yari`, and 14 days are kept. Fetch them regularly, for example weekly from your own computer:
   ```bash
   scp -i <your-key> -r ubuntu@<server IP>:/var/backups/yari ./yari-backups
   ```
   The files are encrypted, and only `.env.production` holds the passphrase.
3. **Test a restore once.** The steps are at the top of `deploy/backup.sh`.

## Updating

```bash
cd ~/yari && git pull && sudo ./deploy/bootstrap.sh
```

Data is kept. Database changes are applied automatically when the app starts.

## Moving to the real domain

If you installed with `sslip.io`, edit `.env.production` and set both lines:

```
DOMAIN=academy.yarigroup.co.za
APP_URL=https://academy.yarigroup.co.za
```

Then run `sudo ./deploy/bootstrap.sh` again. The app is rebuilt, because the address is part of its security headers.

## Demo servers (presentations only)

`sudo ./deploy/bootstrap.sh` without `--live` loads fictional demo data. The logins are saved to `deploy/demo-logins.txt` (`sudo cat deploy/demo-logins.txt`). The Super Admin and trainers need the _authenticator keys_ from that file in an authenticator app.

To reset to fresh demo data:

```bash
sudo docker compose -f docker-compose.prod.yml --env-file .env.production down -v
sudo ./deploy/bootstrap.sh
```

To present from a laptop instead, with no server, see `docs/PRESENT-FROM-LAPTOP.md`.

## Later: moving to managed services

The code already supports S3-compatible file storage (`STORAGE_DRIVER=s3`, see `.env.example`) and any managed Postgres (`DATABASE_URL`). Use them when the platform outgrows one server. Work through `docs/SECURITY.md` and the "before launch" list in `docs/POPIA.md` before inviting learners.
