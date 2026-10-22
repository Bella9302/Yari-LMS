# Deploying a demo server

A single Ubuntu server runs everything in Docker: Caddy (HTTPS), the app, Postgres and ClamAV. The bootstrap script takes a fresh server to a working demo, with fictional data loaded, in about 10–15 minutes.

**A demo server is not the live platform.** It runs with `DEMO_MODE=true`:

- a "Demonstration site · all people and data are fictional" banner on every page;
- emails are never sent;
- the demo seed is allowed.

For the live site, see "Going live" below.

## 1. Create the server (AWS)

1. In the AWS console, switch to **Africa (Cape Town) `af-south-1`**. It is an opt-in region: enable it under _Account → AWS Regions_ first. Keeping the server in South Africa matches the POPIA plan.
2. **EC2 → Launch instance:**
   - **Image:** Ubuntu Server 24.04 LTS (x86_64).
   - **Size:** `t3.medium` (2 vCPU, 4 GB). ClamAV alone needs about 1.5 GB of memory, and the first build is memory-hungry. A `t3.small` works only with the swap the script adds, and builds slowly.
   - **Storage:** 30 GB gp3.
   - **Key pair:** create one and keep the `.pem` file safe.
   - **Security group:** allow SSH (22) from _your IP only_, and HTTP (80) and HTTPS (443) from anywhere.
3. **Elastic IP:** allocate one and associate it with the instance, so the address doesn't change when the server restarts.
4. **Optional, for a branded address:** at whoever hosts `yarigroup.co.za` DNS, add an **A record** `demo.yarigroup.co.za → <Elastic IP>`. Without it, the script uses `<ip>.sslip.io`, which works immediately with a real HTTPS certificate.

## 2. Install

```bash
ssh -i yari-demo.pem ubuntu@<Elastic IP>
# The repository is private: use a GitHub fine-grained token with read-only access to it.
git clone https://github.com/bella9302/yari-lms.git yari && cd yari
git checkout claude/new-session-4cq1ta      # or main, once merged
sudo ./deploy/bootstrap.sh                    # or: sudo ./deploy/bootstrap.sh demo.yarigroup.co.za
```

The script:

1. installs Docker;
2. adds swap on small servers;
3. turns on the firewall;
4. writes `.env.production` with **fresh secrets**;
5. builds and starts the stack and waits for it;
6. loads the demo data;
7. schedules the nightly job.

It finishes by printing the address.

**Logins** are saved to `deploy/demo-logins.txt` (readable by root only):

```bash
sudo cat deploy/demo-logins.txt
```

- **Learners and the Client Manager:** sign in with the shared demo password.
- **The Super Admin and both trainers:** use two-step verification. Before the presentation, add their _authenticator keys_ from the logins file to an authenticator app on the presenter's phone (Google Authenticator, Microsoft Authenticator, 1Password…).

## 3. Presenting

| Show                                                                                   | Sign in as                                                |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Public site, catalogue, enquiry form, certificate check                                | No one: open the address                                  |
| Learner: course, quiz, assignment feedback, certificate, rating a trainer              | Thandiwe Mokoena (finished), Zanele Khumalo (in progress) |
| Company dashboard, staff progress, compliance report (CSV/PDF)                         | Pieter van Wyk (Client Manager)                           |
| Course builder, marking queue (Kagiso's report), gradebook, at-risk (Bongani), ratings | Nomsa Dlamini (Trainer, 2FA)                              |
| People, enquiries, certificates, settings, audit log, POPIA requests                   | Ayanda Nkosi (Super Admin, 2FA)                           |

Because emails are switched off, actions that rely on an emailed link (inviting someone new, password reset) can be shown up to the "sent" step, but the link isn't delivered.

## Updating, resetting and removing

```bash
cd ~/yari && git pull && sudo ./deploy/bootstrap.sh           # update to the latest code (data kept)

# Reset to fresh demo data:
sudo docker compose -f docker-compose.prod.yml --env-file .env.production down -v
sudo ./deploy/bootstrap.sh
```

To remove the demo completely, terminate the EC2 instance and release the Elastic IP; a stopped instance still pays for its disk and IP. Between presentations you can **stop** the instance and start it again later. Everything comes back, because the Elastic IP keeps the address.

## Going live (later)

Use the same files with these changes, and work through the checklist in `docs/SECURITY.md` and the "before launch" list in `docs/POPIA.md`:

- `DEMO_MODE=false`, and never seed demo data. Create the first admin with `npm run db:seed`.
- `RESEND_API_KEY` set, with the sending domain verified in Resend.
- `STORAGE_DRIVER=s3` with a private bucket in `af-south-1`. Give the server an IAM role instead of keys.
- A managed database (Amazon RDS for PostgreSQL in Cape Town) with automated, encrypted backups, or at minimum scheduled `pg_dump` backups copied off the server.
- Keep `.env.production` (especially `FIELD_ENC_KEYS` and `BLIND_INDEX_KEY`) in a secrets manager. **Without these keys the encrypted personal data can't be read.**
