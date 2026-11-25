# S8 — Disclosure Pack for Counsel

**System:** VELTRUVIA neuro-oncology EMR (v2.6.8)
**Chain:** Ethereum Sepolia testnet, chain ID `11155111`, contract `0x601bfA130A709e55122234D046d57a6294aE9E7F`
**Prepared:** 2026-11-25 · **Status:** decision input, not legal advice
**Detail:** `reports/SEPOLIA-DISCLOSURE-ASSESSMENT.md` (analysis) · `reports/SEPOLIA-REPLAY-20261122.json` (evidence)

> One page, three things: what is public, how many people it touches, and the
> decision that needs a date. No identifiers appear in this document.

## 1. What is on the public ledger

Direct patient identifiers were written into Sepolia transaction calldata by the
audit-anchoring path between **2026-09-27T18:02Z and 2026-11-14T10:16Z** (block
11,794,994 → 12,132,454, 48 days). The audit record itself was correctly hashed;
the `targetId` argument was passed through as a plaintext string. Public
calldata is world-readable, mirrored by block explorers and indexers, and cannot
be deleted, redacted or amended — by the operator or anyone else.

The write path was fixed in 2.6.8 (`sha256(targetId)` + `assertHashOnlyAnchor`),
so the population is closed. The fix does not touch what is already public.

## 2. The numbers (replayed from chain, 2026-11-22)

| Item | Value |
|---|---|
| Anchored audit events | **1,008** |
| Distinct identifiers | **70** |
| — short identifiers (MRN-shaped) | 46 |
| — email addresses | 21 |
| — free text | 3 |
| Events carrying a short identifier | 893 |
| Events carrying an email address | 100 |
| Events carrying free text | 15 |
| Exposure window | 2026-09-27T18:02Z → 2026-11-14T10:16Z |
| Operator deletable | No |
| Encrypted on chain | No |

The operator's first enumeration reported 110 events; the replay found 1,008 and
`getEntryCount()` agrees. **110 is retracted — do not cite it.**

## 3. The join: how many people (2026-11-24, read-only copy of the store)

The replay's `--join` hashed the store's `users.email`, `users.id`, every
plaintext `patient_mrn`/`mrn` column and every `audit_log.target_id` with the
same SHA-256, then intersected with the 70 on-chain values.

| Class | Matched | Not matched |
|---|---|---|
| Short identifiers → live patient MRN | **1** | 45 |
| Short identifiers → live user account | 1 | 45 |
| Email addresses → user account | 1 | 20 |
| Free text → any store value | 2 | 1 |

**AFFECTED PATIENTS (floor) = 1.**

That is a **proven minimum, not a headcount**:

- 45 of the 46 short identifiers still appear in `audit_log.target_id`, so the
  system used them for real records — those records just no longer resolve to a
  patient row (deleted, or the MRN lives only inside an encrypted `kv_store`
  blob that cannot be enumerated without the PHI key).
- Patient email addresses held in encrypted blobs cannot be matched at all.
- Identifiers for accounts deleted since the write cannot match.

So the exposed population is **at least 1 and larger by an unknown amount**. It
cannot be bounded from the store alone; bounding it would require decrypting the
live PHI store, which the runbook forbids while the service is running.

## 4. The decision, and the clock

Two questions, in this order:

1. **Discovery date.** The HIPAA 60-day clock (§164.404) runs from when the
   operator knew or should have known, not from today. Candidate dates: the last
   write (2026-11-14), the enumeration (2026-11-19), the replay (2026-11-22), or
   the join (2026-11-24). This choice moves the deadline by ten days and is the
   most time-sensitive item here.
2. **Notify or not.** A low-probability determination (§164.402(2)) is hard to
   defend where the recipient is the general public and mitigation is
   impossible, but that call is counsel's. Under India's DPDP Act the standard
   is "without delay" to the Board and to each affected Data Principal, with no
   outer limit — stricter than HIPAA.

If notice is required, the mechanics are: individuals without unreasonable delay
and no later than 60 days from discovery; HHS via the breach portal; media only
if 500+ residents of one state are affected; DPDP intimation to the Board.

## 5. Suggested notice letter (placeholders only)

> **Subject: Notice of a data exposure affecting your record**
>
> Dear [NAME],
>
> We are writing to tell you about a data exposure that affected a record
> associated with identifier [MRN] in our clinical system.
>
> **What happened.** Between 27 September and 14 November 2026, our audit system
> wrote a copy of that identifier — [and the email address [EMAIL], if
> applicable] — to a public blockchain test network, where it could be read by
> anyone. The clinical record itself, and the rest of your medical history, were
> not published.
>
> **What we have done.** We found and stopped the fault on 14 November 2026 and
> confirmed the fix in version 2.6.8. We have re-read the entire public record so
> that we know exactly what was published. We have corrected the internal
> documentation that misdescribed this data flow.
>
> **What we cannot do.** Data written to a public blockchain cannot be deleted or
> altered by us or by anyone else. We are telling you this plainly rather than
> suggesting otherwise.
>
> **What you can do.** The published value is an identifier and, where
> applicable, an email address — not your diagnosis or treatment details.
> Nonetheless, if you receive unexpected messages that reference [MRN], treat
> them with caution and tell us. [Clinic contact, phone, email.]
>
> We are sorry this happened. [Signatory, title, date.]

Adapt per patient class (patient vs. staff account vs. email-only), and drop the
email clause where no email was published. Do not include the on-chain
transaction hash in the letter unless counsel wants a verifiable pointer.

## 6. What is already done, and what is not

**Done:** write path fixed and regression-tested; chain replayed; join run and
recorded; last-write timestamp proven to precede the fix; governance documents
(`DATA-GOVERNANCE.md` §3, `DATA-FLOW.md` §B4/§96, `RISK-REGISTER.md` S8)
corrected; incident-response template located (`INCIDENT-RESPONSE.md` §3).

**Not done — deliberately:** no burn address, self-destruct or
counter-transaction (calldata cannot be removed; an attempt looks like
spoliation). No live-store decryption to widen the headcount. No notification
sent: that is the decision above.
