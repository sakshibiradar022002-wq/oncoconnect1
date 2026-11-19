# Sepolia On-Chain Disclosure — Risk Assessment

**Prepared for:** legal counsel review
**Status:** DRAFT — internal assessment, not legal advice
**Date:** 2026-11-19
**System:** VELTRUVIA neuro-oncology EMR, audit-trail anchoring
**Chain:** Ethereum Sepolia testnet (chain ID `11155111`)
**Contract:** `0x601bfA130A709e55122234D046d57a6294aE9E7F`

> **Scope note.** This document was prepared from the operator's enumeration
> (110 events) and the repository's own design documents. The on-chain payload
> was **not** independently re-read from Sepolia while drafting. The record
> count, field inventory and identifier classes below must be confirmed against
> the chain before this assessment is relied on. Every figure marked
> **[VERIFY]** is unconfirmed.

---

## 1. Summary

110 audit events written to the public Sepolia testnet contain **MRNs and email
addresses in addition to the hash chain**. Testnet data is world-readable,
permanent, and cannot be deleted or amended by the operator. This is a
disclosure of direct patient identifiers to an uncontrolled public ledger.

This contradicts the system's published data-flow position:

- `DATA-GOVERNANCE.md` §3: "Sepolia blockchain | One-way **hashes** of audit
  events + previous-hash chain | No PHI, no names, no MRNs on chain."
- `DATA-FLOW.md` §B4: "**hashes only** — no PHI, no names, no MRNs".
- `DATA-FLOW.md` §96 lists "Blockchain" under PHI destinations as
  "hash-only chain writes".

Either the documentation is wrong about what was written, or the write path
changed after those documents were verified (2026-10-05). Resolving that
discrepancy is itself a deliverable for counsel and for the security record.

## 2. Facts as enumerated

| Item | Value | Confidence |
|---|---|---|
| Events on chain | 110 | Operator enumeration **[VERIFY count on-chain]** |
| Network | Sepolia (public testnet) | Confirmed in source and deployment records |
| Data readable by | Anyone, no authentication | Inherent to a public chain |
| Data deletable by operator | **No** | Inherent to a public chain |
| Fields present | MRN, email address, plus audit-event fields and hash chain | Operator statement **[VERIFY field list]** |
| Patients affected | Unknown — MRNs must be joined to the local patient store | **[VERIFY]** |
| Write window | Unknown — first and last anchored block not yet recorded | **[VERIFY]** |
| Encryption at rest on chain | None | Public calldata is plaintext |

An MRN is not a pseudonym in this system: the local patient store maps MRN →
name, date of birth and clinical record. Anyone who obtains both the chain data
and any copy of the store (backup, stolen disk, insider, exported CSV) has a
complete re-identification path. The email address is directly identifying on
its own and is linkable across services.

## 3. Why the data is probably on chain

`VELTRUVIA Server/resources/app/src/blockchain/index.js` builds the anchored
payload from audit entries. The Sepolia backend (`BLOCKCHAIN_MODE=sepolia`)
forwards the entry through `anchorWithNonceRetry(...)` to the contract. The
contract stores whatever it is given as opaque bytes/string; it does not
validate that the argument is a hash. If the entry object (rather than
`entry.hash`) reached the contract call, identifiers would be written verbatim.
That is the most likely mechanism and should be confirmed by reading one
transaction's input data on Etherscan.

A second possibility is that the hash is correct but the *pre-image* was
published elsewhere (log, repo, Sentry event). That would be a different and
lesser exposure. The distinction matters for notification and must be settled
before counsel relies on this document.

## 4. Risk analysis

| Dimension | Assessment |
|---|---|
| Confidentiality | **Breached** for the identifiers present. No confidentiality control can be applied to a public ledger. |
| Integrity | Unaffected — this is an over-disclosure, not tampering. |
| Availability | Unaffected. |
| Reversibility | **None.** There is no delete, redact or rotate operation for on-chain data. |
| Persistence | Testnet, but Sepolia is long-lived and mirrored by block explorers and indexers. Assume permanent. |
| Linkability | MRN + email in the same record links a clinical identifier to a contactable person. Multiple events per patient may form a longitudinal timeline. |
| Scale | Up to 110 records; patient count likely lower than 110 (repeat events per patient) — **[VERIFY]** by distinct MRN. |

**Severity: High.** Direct identifiers for a defined patient population are
permanently public, with no compensating control available on the affected
medium.

**Likelihood of harm:** depends on whether the data is indexed and reachable.
Sepolia is low-traffic and not a target for criminals, but it is fully public,
crawled, and retained. The correct planning assumption is that the data is
discoverable by anyone who looks, now or in ten years.

## 5. Notification analysis

This section frames the questions; it does not answer them. Notification
decisions belong to counsel and the covered entity.

### 5.1 HIPAA (if any US patients are affected)

- A use or disclosure not permitted by the Privacy Rule is a breach unless the
  covered entity demonstrates a **low probability that the PHI was compromised**,
  assessed on the four factors in 45 CFR §164.402(2): nature and extent of the
  PHI, the unauthorized recipient, whether the PHI was actually acquired or
  viewed, and the extent of risk mitigation.
- Public, permanent, unauthenticated disclosure of MRN + email weighs heavily
  against a low-probability finding. The "recipient" is the general public and
  mitigation is impossible.
- If notification is required: individuals without unreasonable delay and no
  later than **60 days** from discovery (§164.404); HHS via the breach portal
  (§164.408); media only if 500+ residents of a state are affected.
- **Discovery date is a live question.** The 60-day clock runs from when the
  operator knew or should have known. If the 110 events were known earlier and
  not assessed, that date — not today — starts the clock. This is the single
  most time-sensitive item in this document.

### 5.2 India DPDP Act (if any Indian patients are affected)

- MRN and email are "personal data"; the disclosure is a personal data breach.
- The Act requires intimation to the Data Protection Board and to each affected
  Data Principal "without delay", with particulars of the breach, consequences,
  and remedial measures. There is no 60-day outer limit; "without delay" is
  stricter than HIPAA.
- Because no remediation of the medium is possible, the notice must describe
  containment of the *source* (stopping further identifier writes) and the
  practical advice to affected individuals.

### 5.3 Contractual / other

- The AWS BAA does not cover this: Sepolia is not an AWS service and is not a
  subprocessor in `DATA-GOVERNANCE.md` §5. It should be added to the
  subprocessor/flow inventory as an outbound destination, with this disclosure
  recorded against it.
- Any future clinic contract that warrants "no PHI leaves the system except
  hashes" is currently inaccurate. That warranty must be corrected before it is
  signed.

## 6. Recommended actions

Ordered by urgency. Items 1–2 stop the bleeding; 3–5 bound the damage; 6–7 are
record-keeping.

1. **Stop identifier writes (today, no approval needed).** In the Sepolia
   anchor path, assert that the anchored value matches `^0x[0-9a-f]{64}$`
   before the contract call. Reject and log loudly otherwise. This prevents the
   population from growing while the assessment is underway.
2. **Freeze the write path, not the service.** Anchoring is documented as
   fail-open; set `BLOCKCHAIN_MODE=file` if the guarantee cannot be restored
   quickly. Local tamper-evidence continues; no PHI reaches the chain.
3. **Re-read the chain and produce the definitive record.** Pull every
   transaction to the contract, decode the input, count distinct MRNs and
   emails, record first/last block and timestamps. This turns **[VERIFY]** into
   fact and is the evidentiary basis for notification.
4. **Do not attempt to "fix" the chain.** No burn address, no self-destruct, no
   counter-transaction removes calldata. Any such action creates a second,
   confusing record and can look like spoliation.
5. **Prepare individual notice content** (what happened, what data, what has
   been done, what the person should do) so counsel can approve and send
   quickly if required. Reuse the template shape in `INCIDENT-RESPONSE.md` §3.
6. **Correct the governance documents.** `DATA-GOVERNANCE.md` §3, `DATA-FLOW.md`
   §B4 and §96, and `RISK-REGISTER.md` must describe what actually happened,
   including the date range. Add Sepolia to the subprocessor table with a note
   that it is a public testnet and not a contracted processor.
7. **Log it in the risk register** as a new S-item (public-ledger disclosure of
   direct identifiers), owner assigned, linked to this document. Do not mark it
   closed when the write path is fixed — the disclosure already happened.

## 7. Questions for counsel

1. Does a public testnet count as "disclosure" for HIPAA §164.402, and can the
   low-probability exception ever apply where the recipient is the public and
   the medium is immutable?
2. What is the defensible "discovery date" — the date of the write, the date
   the operator enumerated the 110 events, or today?
3. For DPDP, does "without delay" require notice before the on-chain record is
   fully re-read, or may the record be completed first?
4. Are email addresses alone sufficient to require notification where the MRN
   cannot be linked without the local store?
5. What must be retained as evidence of this assessment, and for how long
   (HIPAA documentation retention is 6 years; DPDP retention is unresolved)?

## 8. Limitations of this document

- The on-chain payload was not read during drafting; §2 and §4 rest on the
  operator's enumeration.
- No patient count was computed; 110 is an event count, not a person count.
- No legal conclusion is offered. The HIPAA and DPDP sections identify the
  applicable tests, not their outcome.
- The 60-day HIPAA clock may already be running. Treat the dates in §5.1 as the
  first thing to settle.

---

*Related: `INCIDENT-RESPONSE.md`, `DATA-GOVERNANCE.md`, `DATA-FLOW.md`,
`RISK-REGISTER.md`, `HIPAA-CONTROLS.md`, `contracts/README.md`.
Prepared 2026-11-19. Review with counsel before any external use.*
