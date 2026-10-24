# Presenting YARI Academy from a laptop

Run the demo on your own laptop and share it with a free, temporary Cloudflare link such as `https://plain-sea-hockey-trend.trycloudflare.com`. Clients can open the link on their own phones or computers. You need no server, no domain and no DNS.

It's a **demo**: every person and record in it is fictional, emails aren't sent, and a banner on every page says so. The link only works while your laptop is on and running the demo.

## One-time setup (about 20 minutes)

### 1. Install Docker Desktop

- Download it from **https://www.docker.com/products/docker-desktop/** and install it.
  - **Mac:** pick _Apple Silicon_ or _Intel_ to match your Mac (Apple menu → About This Mac).
  - **Windows:** if the installer asks to enable **WSL 2**, say yes and restart when it asks.
- Open Docker Desktop and accept the terms (signing in is optional). Wait until the bottom-left corner shows **Engine running** (green).

### 2. Download the YARI Academy code

1. Open **https://github.com/bella9302/yari-lms** and sign in to GitHub.
2. Click the branch button (it says `main`) and choose **`claude/new-session-4cq1ta`**.
3. Click the green **Code** button, then **Download ZIP**.
4. Unzip it somewhere easy, for example into _Documents_, and rename the folder to **`yari`**.

### 3. Open a terminal in that folder

- **Mac:** open the **Terminal** app, type `cd ` (with a space after it), drag the `yari` folder into the Terminal window, and press Enter.
- **Windows:** open the `yari` folder in File Explorer, click the address bar at the top, type `powershell` and press Enter.

### 4. Start the demo

- **Mac:**
  ```
  bash deploy/laptop/start.sh
  ```
- **Windows:**
  ```
  powershell -ExecutionPolicy Bypass -File deploy\laptop\start.ps1
  ```

The first time takes **5–10 minutes** while it builds. It ends like this:

```
==> Ready
  Share this link:   https://plain-sea-hockey-trend.trycloudflare.com
  On this laptop:    http://localhost:3000
  Logins:            deploy/laptop/demo-logins.txt
```

The share link opens in your browser automatically. The **logins** are in `deploy/laptop/demo-logins.txt` inside the `yari` folder. Open it with TextEdit or Notepad. It lists every demo person and the shared demo password.

**Admin and trainer accounts** (Ayanda, Nomsa, Sipho) also need a 6-digit code from an authenticator app:

1. Install **Google Authenticator** or **Microsoft Authenticator** on your phone.
2. Tap **+** → **Enter a setup key**.
3. Type in the _authenticator key_ shown under that person in the logins file.

Learner and company-manager accounts need only the password.

## On the day

1. **Start it 30 minutes before**, using the same command as step 4. It takes under a minute after the first time. **The link is new every time you start**, so send the new one.
2. **Plug in your charger** and stop the laptop sleeping:
   - **Mac:** System Settings → Battery (or Energy) → turn on _Prevent automatic sleeping when the display is off_. Or open a second Terminal window and run `caffeinate -d` until you're done.
   - **Windows:** Settings → System → Power → _When plugged in, put my device to sleep after_ → **Never**.
3. **Test the link on your phone using mobile data** (Wi-Fi off), so you know it works from outside your network.
4. Have a **phone hotspot** ready as a backup internet connection. If you switch networks or the laptop sleeps, run the start command again and share the new link.
5. If the internet fails completely, the demo still runs on your own screen at **http://localhost:3000**.

### What to show

| Show                                                             | Sign in as                                                |
| ---------------------------------------------------------------- | --------------------------------------------------------- |
| Public site, course catalogue, enquiry form, certificate check   | No one: open the link                                     |
| A learner's course, quiz feedback, certificate, rating a trainer | Thandiwe Mokoena (finished), Zanele Khumalo (in progress) |
| Company dashboard, staff progress, compliance report             | Pieter van Wyk (Client Manager)                           |
| Course builder, marking, gradebook, at-risk learners, ratings    | Nomsa Dlamini (Trainer, with authenticator code)          |
| People, enquiries, certificates, settings, audit log             | Ayanda Nkosi (Super Admin, with authenticator code)       |

## Stopping and resetting

- **Stop** (the demo data is kept for next time):
  - **Mac:** `bash deploy/laptop/stop.sh`
  - **Windows:** `powershell -ExecutionPolicy Bypass -File deploy\laptop\stop.ps1`
- **Start again with fresh demo data:** stop it, then run
  ```
  docker compose -f docker-compose.laptop.yml --env-file .env.laptop down -v
  ```
  and start it again. New logins are written to the logins file.

## Good to know

- **Cloudflare's free links are meant for testing.** They have no uptime guarantee and can be a little slower than a real server. That's fine for a presentation, not for daily use by learners.
- **Anyone with the link can see the demo while it's running**, so share it only with the people in the meeting. The link stops working as soon as you stop the demo or shut the laptop.
- **To make it more robust:** the demo leaves out the virus scanner so it runs on an ordinary laptop. A real server (see `docs/DEPLOY.md`) includes it, and is the step to take when YARI Academy goes live.
