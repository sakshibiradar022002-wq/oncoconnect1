# 📧 Resend Email Setup for VELTRUVIA

Resend is the **recommended** email provider — it works on Vercel/serverless (unlike SMTP), has a generous free tier, and takes 2 minutes to set up.

## Quick Setup

### 1. Create a Resend Account
1. Go to **https://resend.com**
2. Click **"Get Started"** (free, no credit card)
3. Sign up with GitHub or email

### 2. Get Your API Key
1. After login, go to **API Keys** in the dashboard
2. Click **"Create API Key"**
3. Name it `veltruvia` 
4. Click **"Add"**
5. Copy the key (starts with `re_...`) — you'll only see it once!

### 3. Verify Your Domain (Recommended)
For production, verify your own domain to send from your address:
1. Go to **Domains** in Resend dashboard
2. Click **"Add Domain"**
3. Enter your domain (e.g., `veltruvia.com`)
4. Add the DNS records Resend gives you (MX, TXT, CNAME)
5. Wait for verification (usually 5-15 minutes)

**For testing**: Use the default `onboarding@resend.dev` — it works immediately but emails show as "via resend.dev".

### 4. Set Environment Variables

#### On Vercel:
1. Go to your project **Settings → Environment Variables**
2. Add:

| Key | Value |
|-----|-------|
| `RESEND_API_KEY` | `re_your_key_here` |
| `EMAIL_FROM` | `VELTRUVIA <onboarding@resend.dev>` |

3. Click **"Save"**
4. **Redeploy** the project (Deployments → ⋯ → Redeploy)

#### On Render/Fly/Railway:
Add to your environment:
```bash
RESEND_API_KEY=re_your_key_here
EMAIL_FROM=VELTRUVIA <onboarding@resend.dev>
```

#### For local development:
Add to your `.env` file:
```
RESEND_API_KEY=re_your_key_here
EMAIL_FROM=VELTRUVIA <onboarding@resend.dev>
```

### 5. Test It
1. Open your app
2. Go to **Register** tab
3. Enter an email and click **"Send Verification Code"**
4. Check your inbox for the OTP email!

## Email Addresses

| Scenario | EMAIL_FROM Value |
|----------|------------------|
| Testing (instant) | `VELTRUVIA <onboarding@resend.dev>` |
| Your domain verified | `VELTRUVIA <noreply@veltruvia.com>` |
| Custom sender | `Dr. Smith <dr@veltruvia.com>` |

## Free Tier Limits
- **100 emails/day**
- **3,000 emails/month**
- Unlimited contacts
- No credit card required

## Troubleshooting

### "Email not configured" error
- Check that `RESEND_API_KEY` is set correctly (starts with `re_`)
- Verify there are no extra spaces in the env var value
- Check Vercel deployment logs for the startup message

### Emails going to spam
- Verify your domain in Resend
- Use your own domain instead of `onboarding@resend.dev`
- Check SPF/DKIM records are correct

### OTP not received
- Check spam/junk folder
- Try a different email address
- Check Resend dashboard → Logs for delivery status
- Use dev mode: when email isn't configured, OTP shows on screen

## What VELTRUVIA Sends

1. **Registration OTP** — 6-digit code, expires in 10 minutes
2. **Appointment reminders** — sent by the doctor/scheduler
3. **Password change codes** — for patient password resets
4. **Broadcast emails** — doctor can email all patients

All emails use branded HTML templates matching VELTRUVIA's design.
