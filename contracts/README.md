# VELTRUVIA Audit Anchor — Sepolia deployment kit

Anchors the **tip hash of the audit chain** (and optionally every audit
record hash) onto the **Sepolia public testnet** — free forever. No patient
data ever touches the chain: only 32-byte SHA-256 fingerprints.

This gives what the file chain alone cannot: the history is committed
**outside the server**, so even someone with full SSH access cannot rewrite
past audit records without the on-chain fingerprint disagreeing.

## One-time setup (~30 min, Sara)

1. **MetaMask wallet** → install in Chrome → create wallet → switch network
   to **Sepolia** → account details → *Show private key* → copy.
2. **Free Sepolia ETH** (you need ~0.05; a little lasts years at our scale):
   - https://sepolia-faucet.pk910.de — PoW faucet: leave the tab open ~20 min
   - or https://sepoliafaucet.com (Google/GitHub login)
3. **Save the key**: create `contracts/.env` (never commit it):
   ```
   ANCHOR_PRIVATE_KEY=0x YourPrivateKeyHere
   ```

## Deploy (one command)

```
cd contracts
npm install
npm run deploy
```

Output: contract address + `deployment.json` (auto-copied into the app
folder). View the contract on https://sepolia.etherscan.io.

## Wire the server to it (my part after deployment)

1. On the VM `.env` add:
   ```
   SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
   ANCHOR_PRIVATE_KEY=0x....
   BLOCKCHAIN_MODE=sepolia
   ```
2. `npm install ethers` on the VM; extend `src/blockchain/index.js` with a
   `sepolia` backend that anchors the **chain tip after each nightly backup**
   (one tx/day ≈ 0.00002 ETH — the faucet amount lasts ~10 years).
3. Restart; verify with `/api/blockchain` stats showing `backend: 'sepolia'`.

## Verify anytime

```
npx hardhat console --network sepolia   # or read deployment.json
(await ethers.getContractAt('AuditTrail', '<address>')).latestChainHashValue()
```
Compare with the tip in `chain-tip.log` on Sara's PC — equal = audit chain
intact AND independently anchored.

## Tests

```
npm test        # 4 tests: anchor, chain-link, access control, counting
```

## Honest notes

- Testnet ETH has no monetary value, but the *anchoring property* is real:
  entries are timestamped by a public, independent network.
- If you later want mainnet anchoring for marketing claims, the same
  contract works — costs ~$0.05–0.50/day at current gas, only when paying
  clinics arrive.
- Keep `ANCHOR_PRIVATE_KEY` wallet funded slightly; if it runs dry, the
  server logs a warning and the file chain continues uninterrupted.
