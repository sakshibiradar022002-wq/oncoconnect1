# AWS Support — follow-up message (paste into Support Center)

**When to send:** the review has been open ~96 hours (opened 2026-11-15).
**Where:** AWS Console → Support → Your support cases → open the case → Reply.
**Why paste manually:** the Support API is not available on the Basic plan.

---

## Message

Hello,

Following up on this case, which has been open for approximately 96 hours
(created 2026-11-15).

To make sure we are not waiting on each other, could you confirm one thing
directly: **is the `veltruvia.duckdns.org` hostname the open question on your
side?**

Context, in case it helps close this out:

- Account: `veltruvia@gmail.com`, AWS Free plan.
- Resource: Lightsail instance `veltruvia-prod`, ap-south-1a (Mumbai),
  static IP `16.4.28.130`.
- The instance serves a small HIPAA-scoped application behind Caddy on
  ports 80/443. TLS is issued by Let's Encrypt for the DuckDNS hostname.
- `veltruvia.duckdns.org` is a free DuckDNS subdomain pointing at the static
  IP. It is a DNS name only — no AWS resource is named or aliased to it, and
  DuckDNS is not an AWS service or subprocessor.
- The AWS BAA for this account was accepted in AWS Artifact on 2026-09-27 and
  covers the Lightsail compute and storage in use.

If the DuckDNS hostname is **not** the blocker, please tell us what
information or action you still need and we will provide it today. If it
**is** the blocker, please confirm what you need in order to close the review
(for example, whether a domain you control is required, or whether a
documented exception for a third-party DNS name is acceptable).

We are not asking for an escalation — just a pointer to the outstanding item
so we can act on it.

Thank you,
[your name]
[clinic / organisation]
[phone]

---

## Notes for you (not part of the message)

- Replace the three bracketed lines at the end before sending.
- Do not paste credentials, the instance's PEM key, the admin password, or the
  `.env` contents into the case. The message above deliberately contains only
  public-facing facts.
- If the reply asks for architecture detail, `DATA-FLOW.md` §2 is a safe
  summary to paraphrase.
- If the case closes with "no action required", save the reply as a PDF into
  `reports/` — it is useful evidence for the compliance file.
