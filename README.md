# Raise Your Hand — Live Poll

A two-screen live polling app for the QIU CPD session icebreaker: a host screen for the projector, and a participant screen people open on their own phones.

- **Host screen**: `host.html` — question, join QR code, live results bar, participant count, Next/Reset controls.
- **Participant screen**: `participant.html` — one big tappable button per option, no login, no app download.

Results update instantly over Socket.io — no manual refresh on either screen.

---

## Which mode should I use?

| Mode | Use when | Participants join via |
|---|---|---|
| **Public deploy (primary)** | You have internet tonight | A public URL, works on their own mobile data, your hotspot, or venue Wi-Fi |
| **Local fallback** | Venue has no usable internet at all | Your laptop's local IP — **only works for devices on the same network as your laptop** (e.g. your phone's hotspot). Someone on their own mobile data cannot reach it. |

Set up the public deploy tonight. Keep the local fallback as a backup plan only.

---

## 1. Deploy tonight (Render — free, public URL)

Render supports WebSockets on its free tier, which Vercel's serverless functions do not — that's why Render is the primary target.

### Step 1 — Get the code onto GitHub
```bash
cd raise-your-hand-poll
git init
git add .
git commit -m "Raise Your Hand live poll app"
```
Create a new empty repository on [github.com/new](https://github.com/new) (public or private, doesn't matter), then:
```bash
git remote add origin https://github.com/<your-username>/<your-repo>.git
git branch -M main
git push -u origin main
```

### Step 2 — Create the Render web service
1. Go to [dashboard.render.com](https://dashboard.render.com) and sign in (GitHub login is easiest).
2. Click **New +** → **Web Service**.
3. Connect the GitHub repo you just pushed.
4. Fill in:
   - **Name**: anything, e.g. `raise-your-hand-poll`
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free
5. Click **Create Web Service**. Render will build and deploy — takes 2-3 minutes.
6. When it's live, Render gives you a public URL like `https://raise-your-hand-poll.onrender.com`.

### Step 3 — Test it
- Open `https://<your-app>.onrender.com/host.html` on your laptop.
- Scan the QR code with your own phone (on mobile data, not Wi-Fi, to prove it really works from anywhere) and confirm you land on the participant screen and can vote.

### ⚠️ Important: free-tier cold start
Render's free web services **spin down after ~15 minutes of inactivity** and take 30-60 seconds to wake back up on the next request. To avoid an awkward pause in front of the room:

- **Open the host screen 5-10 minutes before your session starts** and leave the tab open. This wakes the service and keeps it warm.
- If it's been idle right before you go live, load `host.html` once yourself first, wait for it to respond, *then* show the QR code to the room.

---

## 2. Run it locally

### Setup (run once)
```bash
cd raise-your-hand-poll
npm install
```

### Start the server
```bash
npm start
```
The terminal will print something like:
```
Host screen (open this on your laptop):
  http://localhost:3000/host.html

Participants on your local network should scan/visit:
  http://192.168.1.42:3000/participant.html
```

- Open the `localhost` host URL on your laptop and project it.
- The **local network** address is what the QR code on the host screen will point to automatically when you're running this way — participants on the same network scan it directly, no typing needed.

### Local-hotspot fallback mode (no internet at the venue)
1. Turn on your phone's personal hotspot.
2. Connect your laptop to that hotspot.
3. Run `npm start` — the terminal prints your laptop's IP address on that hotspot network.
4. Have participants join **that same hotspot** (not their own mobile data — this only works for devices on the same local network as your laptop) and scan the QR code on the host screen, or type the printed `http://<ip>:3000/participant.html` address.
5. Personal hotspots typically cap the number of connected devices (often 5-10, depending on phone/carrier) — fine for small groups, but not a substitute for the public deploy with a full room.

**If a phone can't reach the local IP:**
- Double-check it's on the *same* Wi-Fi/hotspot network as your laptop, not a different one.
- Some hotel/venue Wi-Fi networks isolate devices from each other for security ("AP isolation" / "client isolation") — this will block local mode even though everyone's on the same network. There's no fix from your side; switch to the public URL or your phone's hotspot instead.
- Check your laptop's firewall isn't blocking incoming connections on port 3000.
- As a last resort, use your phone's mobile data to load the public Render URL instead — this is exactly why the public deploy is the primary plan.

---

## Editing the questions

Edit `questions.json` — no code changes needed. Each entry needs a unique `id`, the question `text`, and a list of `options` (2 or more):

```json
{
  "id": "q4",
  "text": "Your new question here",
  "options": ["Yes", "No"]
}
```
Add, remove, or reorder entries freely. Restart the server (or redeploy) after editing so it picks up the change — votes are stored in memory and reset whenever the server restarts.

---

## How it works, briefly

- **Backend**: Node.js + Express serves the static pages; Socket.io pushes live state (current question, vote counts, participant count) to every connected screen.
- **No database**: everything lives in memory for the duration of the process — perfect for a one-time live session, but a server restart clears all votes and returns to Question 1.
- **No double-voting**: each participant's browser gets a random ID stored in `localStorage` the first time they open the link. The server tracks one vote per ID per question, so refreshing the page won't let someone vote twice — it just shows them their existing vote.
- **QR code**: generated server-side (via the `qrcode` package) from whatever URL the host page was actually loaded from, so it automatically points to the right place whether you're on `localhost`, a local IP, or the public Render URL.
