// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title VELTRUVIA Audit Trail
 * @notice Immutable audit log for healthcare records
 * @dev Stores hashes of medical records for tamper-proof verification
 */
contract AuditTrail {
    struct AuditEntry {
        bytes32 recordHash;      // SHA-256 hash of the encrypted record
        address actor;           // Who performed the action
        string action;           // What was done (e.g., 'sync.push', 'patient.login')
        string targetId;         // Affected record ID (patient MRN, user ID, etc.)
        uint256 timestamp;       // When it happened
        bytes32 previousHash;    // Chain hash for integrity verification
    }

    mapping(uint256 => AuditEntry) public entries;
    uint256 public entryCount;
    
    // Record hash => entry index (for quick lookup)
    mapping(bytes32 => uint256[]) public hashToEntries;
    
    // Block hash of the latest entry (for chain verification)
    bytes32 public latestChainHash;
    
    // Event for off-chain indexing
    event AuditRecorded(
        uint256 indexed entryId,
        bytes32 indexed recordHash,
        address indexed actor,
        string action,
        string targetId,
        uint256 timestamp,
        bytes32 chainHash
    );

    // Only contract owner can add entries (the server)
    address public owner;
    mapping(address => bool) public authorizedActors;
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }
    
    modifier onlyAuthorized() {
        require(authorizedActors[msg.sender] || msg.sender == owner, "Not authorized");
        _;
    }

    constructor() {
        owner = msg.sender;
        authorizedActors[msg.sender] = true;
        latestChainHash = bytes32(0);
    }

    /**
     * @notice Authorize an address to write audit entries
     * @param actor Address to authorize
     */
    function authorizeActor(address actor) external onlyOwner {
        authorizedActors[actor] = true;
    }

    /**
     * @notice Record an audit entry on the blockchain
     * @param recordHash SHA-256 hash of the encrypted medical record
     * @param action Description of the action
     * @param targetId ID of the affected record
     * @return entryId The index of the new entry
     */
    function recordAudit(
        bytes32 recordHash,
        string calldata action,
        string calldata targetId
    ) external onlyAuthorized returns (uint256 entryId) {
        entryId = entryCount;
        
        // Calculate chain hash: hash(previousHash + recordHash + timestamp)
        bytes32 chainHash = keccak256(
            abi.encodePacked(
                latestChainHash,
                recordHash,
                block.timestamp,
                msg.sender
            )
        );

        entries[entryId] = AuditEntry({
            recordHash: recordHash,
            actor: msg.sender,
            action: action,
            targetId: targetId,
            timestamp: block.timestamp,
            previousHash: latestChainHash
        });

        hashToEntries[recordHash].push(entryId);
        latestChainHash = chainHash;
        entryCount++;

        emit AuditRecorded(
            entryId,
            recordHash,
            msg.sender,
            action,
            targetId,
            block.timestamp,
            chainHash
        );
    }

    /**
     * @notice Verify a record hash exists in the audit trail
     * @param recordHash The hash to verify
     * @return exists True if the hash is recorded
     * @return entryIds Array of entry IDs where this hash appears
     */
    function verifyRecord(bytes32 recordHash) external view returns (bool exists, uint256[] memory entryIds) {
        entryIds = hashToEntries[recordHash];
        exists = entryIds.length > 0;
    }

    /**
     * @notice Get an audit entry by ID
     * @param entryId The entry index
     * @return entry The audit entry data
     */
    function getEntry(uint256 entryId) external view returns (AuditEntry memory) {
        require(entryId < entryCount, "Entry does not exist");
        return entries[entryId];
    }

    /**
     * @notice Verify the integrity of the audit chain
     * @param startEntry Starting entry ID
     * @param endEntry Ending entry ID (exclusive)
     * @return valid True if the chain is intact
     */
    function verifyChain(uint256 startEntry, uint256 endEntry) external view returns (bool valid) {
        require(startEntry < endEntry && endEntry <= entryCount, "Invalid range");
        
        bytes32 currentHash = startEntry == 0 ? bytes32(0) : entries[startEntry - 1].previousHash;
        
        for (uint256 i = startEntry; i < endEntry; i++) {
            AuditEntry memory entry = entries[i];
            if (entry.previousHash != currentHash) {
                return false;
            }
            currentHash = keccak256(
                abi.encodePacked(
                    entry.previousHash,
                    entry.recordHash,
                    entry.timestamp,
                    entry.actor
                )
            );
        }
        return true;
    }

    /**
     * @notice Get the total number of audit entries
     * @return count Total entries
     */
    function getEntryCount() external view returns (uint256 count) {
        return entryCount;
    }
}
