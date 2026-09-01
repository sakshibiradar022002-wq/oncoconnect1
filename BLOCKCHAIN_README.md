# 🔗 VELTRUVIA Blockchain Audit Trail

## Overview

VELTRUVIA now includes a **hybrid blockchain architecture** that provides tamper-proof audit trails for medical records while maintaining HIPAA compliance.

### How It Works

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Doctor App    │────▶│  VELTRUVIA    │────▶│   Blockchain    │
│   Patient App   │     │    Server       │     │   (Local)       │
│   Lab App       │     │  (Express)      │     │   Audit Trail   │
└─────────────────┘     └────────┬────────┘     └─────────────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │   SQLite DB     │
                        │  (Encrypted)    │
                        └─────────────────┘
```

### What Goes On-Chain vs Off-Chain

| On-Chain (Blockchain) | Off-Chain (Database) |
|----------------------|---------------------|
| Record hashes (SHA-256) | Actual encrypted medical records |
| Audit timestamps | Patient data, lab results |
| Action types | User credentials |
| Actor identifiers | Session data |

## Benefits

1. **Tamper-Proof Audit Trail**: Every record operation is cryptographically verified
2. **Immutable History**: Once recorded, audit entries cannot be altered
3. **Chain Integrity**: Verify the entire audit chain hasn't been compromised
4. **No Gas Fees**: Uses local Hardhat blockchain (free, no real money)
5. **HIPAA Compliant**: Actual PHI stays encrypted in database, only hashes on-chain

## Quick Start

### 1. Start the Blockchain Node

```bash
# Start Hardhat local blockchain
npm run blockchain:node
```

### 2. Compile & Deploy Contract

```bash
# Compile smart contract
npm run blockchain:compile

# Deploy to local network
npm run blockchain:deploy
```

### 3. Start VELTRUVIA Server

```bash
# Start the server (blockchain connects automatically)
npm run dev
```

### 4. Access Blockchain Dashboard

Open: `http://localhost:3000/blockchain.html`

## API Endpoints

### `GET /api/blockchain/status`
Get blockchain connection status and statistics.

### `POST /api/blockchain/verify`
Verify a record hash exists on the blockchain.

### `GET /api/blockchain/health`
Health check for blockchain connection.

## Smart Contract: AuditTrail

The `AuditTrail.sol` contract provides:

- **`recordAudit()`**: Record a new audit entry
- **`verifyRecord()`**: Check if a record hash exists
- **`getEntry()`**: Get details of a specific entry
- **`verifyChain()`**: Verify audit chain integrity

## Commands

```bash
# Blockchain management
npm run blockchain:node        # Start local blockchain
npm run blockchain:compile     # Compile contracts
npm run blockchain:deploy      # Deploy contract
npm run blockchain:verify      # Verify records
```

## Architecture Details

### Audit Flow

1. User performs action (e.g., sync patient data)
2. Server writes to SQLite database (primary storage)
3. Server hashes the record: `SHA-256(encrypted_data)`
4. Hash is recorded on blockchain with metadata
5. Response returned to user (async, non-blocking)

### Verification Flow

1. User requests verification via API or UI
2. Record hash is computed
3. Smart contract checks if hash exists on-chain
4. Returns verification result with audit details

## Security Considerations

- **Encryption**: All PHI is encrypted before hashing
- **Access Control**: Only authorized addresses can write to blockchain
- **No PHI on-chain**: Only cryptographic hashes are stored
- **Local Network**: Hardhat runs locally, no external exposure

## Troubleshooting

### "Blockchain not connected"

```bash
# Check if Hardhat is running
curl http://127.0.0.1:8545

# If not, start it
npm run blockchain:node
```

### "Contract not deployed"

```bash
# Compile and deploy
npm run blockchain:compile
npm run blockchain:deploy
```

## Future Enhancements

- [ ] Migrate to Polygon testnet for production
- [ ] Add IPFS for decentralized record backup
- [ ] Implement zero-knowledge proofs for privacy
- [ ] Add multi-signature audit approvals
