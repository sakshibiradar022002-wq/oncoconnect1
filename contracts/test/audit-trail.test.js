const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('AuditTrail', () => {
  let contract;
  const H1 = ethers.id('audit record #1');   // keccak256 as a stand-in hash
  const H2 = ethers.id('audit record #2');

  beforeEach(async () => {
    const F = await ethers.getContractFactory('AuditTrail');
    contract = await F.deploy();
    await contract.waitForDeployment();
  });

  it('anchors a hash and verifies it exists', async () => {
    await contract.recordAudit(H1, 'login', 'user-1');
    const [exists, ids] = await contract.verifyRecord(H1);
    expect(exists).to.equal(true);
    expect(ids.length).to.equal(1);
    const [, action, targetId] = await contract.getEntry(ids[0]);
    expect(action).to.equal('login');
    expect(targetId).to.equal('user-1');
  });

  it('links entries: entry n references entry n-1 tip', async () => {
    await contract.recordAudit(H1, 'a', 't1');
    const tip1 = await contract.latestChainHashValue();
    await contract.recordAudit(H2, 'b', 't2');
    const [, , , , prev2] = await contract.getEntry(1);
    expect(prev2).to.equal(tip1.toString());
  });

  it('rejects empty hashes and non-admin writers', async () => {
    async function reverts(promiseFactory) {
      try { await (await promiseFactory).wait(); return false; } catch { return true; }
    }
    expect(await reverts(contract.recordAudit(ethers.ZeroHash, 'x', 'y'))).to.equal(true);
    const [, other] = await ethers.getSigners();
    expect(await reverts(contract.connect(other).recordAudit(H1, 'x', 'y'))).to.equal(true);
  });

  it('counts entries and finds duplicates', async () => {
    await contract.recordAudit(H1, 'a', 't');
    await contract.recordAudit(H1, 'a', 't');
    expect(Number(await contract.getEntryCount())).to.equal(2);
    const [, ids] = await contract.verifyRecord(H1);
    expect(ids.length).to.equal(2);
  });
});
