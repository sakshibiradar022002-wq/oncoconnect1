# 🚀 VELTRUVIA Pro — 5-Minute Deploy to Render + Turso

## Step 1: Create Turso Database (2 min)

**Option A — Using Turso CLI (recommended):**
```bash
# Install CLI
npm install -g @turso/cli

# Sign up and login
turso auth signup

# Create database
turso db create veltruvia

# Get the database URL
turso db show veltruvia --url
# → Copy: libsql://veltruvia-xxxx.turso.io

# Create auth token
turso db tokens create veltruvia
# → Copy: eyJhbG... (the full token)
```

**Option B — Using Turso Dashboard (no CLI):**
1. Go to https://turso.tech → Sign up with GitHub/Google
2. Click **Create Database**
3. Name: `veltruvia` → Region: closest to your users
4. Go to **Database Tokens** → Create token → Copy it
5. Go to **Database URL** → Copy it

---

## Step 2: Push to GitHub (1 min)

```bash
# If not already a git repo
git init
git add .
git commit -m "VELTRUVIA ready for deployment"

# Create repo on GitHub, then:
git remote add origin https://github.com/YOUR_USERNAME/veltruvia.git
git push -u origin main
```

---

## Step 3: Deploy to Render (2 min)

1. Go to **https://render.com** → Sign up (free)

2. Click **New +** → **Blueprint**

3. Connect your GitHub repo → Select `veltruvia` repo

4. Render reads `render.yaml` and sets up everything automatically

5. When prompted, paste your Turso credentials:
   - `TURSO_DATABASE_URL` = `libsql://veltruvia-xxxx.turso.io`
   - `TURSO_AUTH_TOKEN` = `eyJhbG...`

6. Click **Apply** → Render builds and deploys (~2 min)

7. 🎉 Your app is live at: `https://veltruvia-server.onrender.com`

---

## Step 4: Verify

1. Open: `https://veltruvia-server.onrender.com/health`
   → Should show: `{"ok":true,"ts":"..."}`

2. Open: `https://veltruvia-server.onrender.com`
   → VELTRUVIA login page

3. Create your first doctor account and start using it!

---

## Environment Variables (all set automatically except Turso)

| Variable | Source | Notes |
|----------|--------|-------|
| `NODE_ENV` | ✅ Set in render.yaml | `production` |
| `JWT_SECRET` | ✅ Auto-generated | Render creates this |
| `PHI_ENCRYPTION_KEY` | ✅ Auto-generated | Render creates this |
| `TURSO_DATABASE_URL` | ⚠️ You paste this | From Turso dashboard |
| `TURSO_AUTH_TOKEN` | ⚠️ You paste this | From Turso dashboard |
| `DB_PATH` | Not needed | Turso overrides this |

---

## After Deploy — Your App URL

```
https://veltruvia-server.onrender.com
```

### Default Test Accounts (auto-created):
- **Doctor:** test@example.com / testdoc123
- **Patient:** MRN=12345 / testpat123
- **Lab:** testlab / testlab123

---

## Troubleshooting

**Build fails?**
- Check Render logs: Dashboard → veltruvia-server → Logs
- Most common: Node.js version → Render defaults to Node 20 ✅

**Database errors?**
- Verify Turso URL starts with `libsql://`
- Verify token is valid: `turso db tokens list veltruvia`

**App won't start?**
- Check environment variables are set correctly
- Look at Render logs for the specific error

---

## Cost

| Service | Plan | Cost |
|---------|------|------|
| Render | Free tier | $0/month |
| Turso | Free tier | $0/month (500 databases, 9GB storage) |
| **Total** | | **$0/month** 🎉 |

> ⚠️ Render free tier spins down after 15 min of inactivity. First request takes ~30s to wake up. Upgrade to Starter ($7/mo) for always-on.
