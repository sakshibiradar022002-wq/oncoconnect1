# 💳 UPGRADE PATHS — the paid items, exactly how they'd happen

Written 2026-09-27. Each item is independent; buy only when the reason exists.

---

## 1 · UptimeRobot (FREE — do it anytime, 3 min)

The only item on the paid-list that's actually free. My setup part is done —
the watchdog + logs exist. Your 3 minutes:

1. https://uptimerobot.com → Sign up free (veltruvia@gmail.com, no card)
2. **+ Add New Monitor**
   - Type: **HTTP(s)** · Name: `VELTRUVIA Prod`
   - URL: `https://veltruvia.duckdns.org/health`
   - Interval: 5 min (free tier default)
3. (Optional) Settings → Alert Contacts → add SMS/Telegram
4. Done — external "site is down" emails forever, from their servers

*Why it matters:* my local watchdog only logs if YOUR PC is on. UptimeRobot
watches from the internet — it catches outages even when your PC is off.

## 2 · Private repo (FREE — one click, you approved this)

GitHub → **github.com/sakshibiradar022002-wq/oncoconnect1/settings** →
bottom **Danger Zone** → **Change visibility** → **Private**.
My part: nothing left — the push, secrets scrub, and archive branch are done.

## 3 · Paid CA code signing (~$100–300/yr — when strangers install)

**What it buys:** Windows SmartScreen shows "publisher verified" instead of
the warning, on machines you've never touched.

**Exact path when ready:**
1. Buy an **OV code-signing certificate** (Sectigo or Certum via a reseller;
   ~$100–300/yr). Requires identity/business verification + a hardware token
   (new CA/Browser rule since 2023).
2. The cert ships on the token — signtool uses it directly:
   `signtool sign /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 <exe>`
   (identical to what I already automated — only the cert source changes)
3. Optional: put `CSC_LINK`/`CSC_KEY_PASSWORD` in the build env so
   electron-builder signs during build (see BUILDING.md §signing)
4. Re-sign + re-upload both installers, regenerate SHA256SUMS.txt (my part, 10 min)

**Until then:** the self-signed cert (valid to Sep 2029) + clinic PC import
of `VELTRUVIA-codesign.cer` = zero warnings where it matters today.

## 4 · Professional pen-test (~₹50k–2L — when a hospital demands it)

**What it buys:** a signed attestation report hospitals accept for procurement.

**How to prepare so you don't waste the money:**
1. Freeze a version (tag it: `git tag v2.3.1-pentest-audit`)
2. Give the vendor: the URL, a test account, and scope = "web app + API"
3. Ask specifically for: OWASP Top 10, auth/bypass, PHI exposure paths,
   rate-limit effectiveness, TLS config
4. Things they'll find that we already know to disclose: self-signed installer
   (item 3), testnet anchoring (marketing vs security), single-server
   architecture (item 5 in their report will say "no WAF" — acceptable at
   this scale, Cloudflare proxy is the cheap answer if they insist)
5. Remediate + re-test → the report becomes a sales asset for years

**Free pre-work I already did:** 0 npm vulnerabilities (production deps),
full security-header set verified live (CSP/HSTS/XFO/nosniff/Referrer/
Permissions), rate limiting + lockout in code, secrets hygiene audited.

## 5 · Mainnet anchoring (~$15–60/mo — only for marketing)

**When:** a paying clinic wants "records anchored on the public Ethereum
blockchain" in the contract/brochure.

**Exact path:**
1. Fund the SAME anchor wallet with ~0.01 real ETH (~$30) on mainnet
2. Deploy the identical contract: `npx hardhat run deploy.js --network mainnet`
   (add the mainnet stanza to hardhat.config.cjs — 4 lines, I'll do it)
3. VM .env: add `BLOCKCHAIN_NETWORK=mainnet` + mainnet RPC (Alchemy free tier)
4. Cost control: anchor the **tip once per night** (~$0.50–2/day at typical
   gas) — the daily-tip design from day 1 exists precisely for this
5. Re-verify on etherscan.io (mainnet) + update the brochure ✨

**Honest note:** testnet anchoring gives the same tamper-EVIDENCE today.
Mainnet adds brand value and permanence guarantees, not more security.

## 6 · Multi-clinic scale-out ($7/clinic/mo — when clinic #2 signs)

Complete playbook now in **MULTI-CLINIC-PLAYBOOK.md**: architecture choice
(shared vs isolated VM), 10-step install checklist reusing today's scripts,
free-vs-paid scaling table, governance list.

---

## Priority order (my recommendation)

| # | Item | Cost | Trigger | Wait-or-do |
|---|---|---|---|---|
| 1 | UptimeRobot | free | now | **do this week** |
| 2 | Private repo | free | now | **one click** |
| 3 | Phone APK test | free | now | **10 min, your hands** |
| 4 | CA signing | $$ | first stranger-install scenario | wait |
| 5 | Pen-test | $$$ | first hospital procurement | wait |
| 6 | Mainnet | $$ | first marketing claim | wait |
| 7 | Scale-out | $/clinic | clinic #2 | playbook ready |
