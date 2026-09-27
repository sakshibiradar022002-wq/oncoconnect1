// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title VELTRUVIA AuditTrail
/// @notice Anchors SHA-256 hashes of audit records on-chain. NO patient data
///         is ever stored here — only 32-byte fingerprints, an action label,
///         and a target id. Each added entry is linked to the previous
///         entry's hash so the on-chain history can be proven contiguous.
contract AuditTrail {
    struct Entry {
        bytes32 recordHash;   // SHA-256 of the audit record payload
        string  action;       // e.g. "login", "record-view", "prescribe"
        string  targetId;     // opaque id (never PHI)
        uint64  timestamp;
        bytes32 previousHash; // hash of the prior entry's recordHash (chain link)
        address actor;        // wallet that submitted (the server's anchor wallet)
    }

    Entry[] private entries;
    bytes32 private latestChainHash;
    address public admin;

    event EntryRecorded(uint256 indexed id, bytes32 recordHash, string action, bytes32 previousHash);

    error NotAdmin();
    error EmptyHash();

    constructor() {
        admin = msg.sender;
    }

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    /// @notice Anchor one audit record hash.
    function recordAudit(bytes32 recordHash, string calldata action, string calldata targetId)
        external
        onlyAdmin
    {
        if (recordHash == bytes32(0)) revert EmptyHash();
        bytes32 prev = latestChainHash;
        entries.push(Entry({
            recordHash: recordHash,
            action: action,
            targetId: targetId,
            timestamp: uint64(block.timestamp),
            previousHash: prev,
            actor: msg.sender
        }));
        // Latest chain hash = hash of (new recordHash, previous tip): a single
        // value that commits to the entire history, printable in reports.
        latestChainHash = keccak256(abi.encodePacked(recordHash, prev));
        emit EntryRecorded(entries.length - 1, recordHash, action, prev);
    }

    /// @notice Verify a record hash exists; returns true + ids of all entries.
    function verifyRecord(bytes32 recordHash)
        external
        view
        returns (bool exists, uint256[] memory ids)
    {
        uint256 count = 0;
        for (uint256 i = 0; i < entries.length; i++) {
            if (entries[i].recordHash == recordHash) count++;
        }
        if (count == 0) return (false, new uint256[](0));
        ids = new uint256[](count);
        uint256 k = 0;
        for (uint256 i = 0; i < entries.length; i++) {
            if (entries[i].recordHash == recordHash) ids[k++] = i;
        }
        return (true, ids);
    }

    function getEntry(uint256 id)
        external
        view
        returns (bytes32 recordHash, string memory action, string memory targetId, uint64 timestamp, bytes32 previousHash)
    {
        Entry storage e = entries[id];
        return (e.recordHash, e.action, e.targetId, e.timestamp, e.previousHash);
    }

    function getEntryCount() external view returns (uint256) {
        return entries.length;
    }

    function latestChainHashValue() external view returns (bytes32) {
        return latestChainHash;
    }

    /// @notice Transfer admin (e.g. to a new server wallet during rotation).
    function transferAdmin(address next) external onlyAdmin {
        admin = next;
    }
}
