// Hardhat 2 config (CJS). Free public Sepolia RPC by default; a free
// Alchemy/Infura key is recommended for reliability.
require('@nomicfoundation/hardhat-ethers');
const fs = require('node:fs');
// Load contracts/.env manually (no dotenv dependency needed)
try {
  for (const line of fs.readFileSync(__dirname + '/.env', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
} catch { /* no .env yet */ }

const RPC = process.env.SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com';

module.exports = {
  solidity: '0.8.24',
  networks: {
    sepolia: {
      url: RPC,
      accounts: process.env.ANCHOR_PRIVATE_KEY ? [process.env.ANCHOR_PRIVATE_KEY] : [],
    },
  },
};
