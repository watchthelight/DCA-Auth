// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/**
 * @title DCA-Auth License Registry
 * @dev Immutable on-chain license registry with NFT representation
 */
contract LicenseRegistry is ERC721, ERC721URIStorage, Ownable, ReentrancyGuard {
    using Counters for Counters.Counter;

    Counters.Counter private _tokenIdCounter;
    Counters.Counter private _licenseIdCounter;

    enum LicenseStatus {
        ACTIVE,
        SUSPENDED,
        REVOKED,
        EXPIRED
    }

    enum LicenseType {
        TRIAL,
        STANDARD,
        PREMIUM,
        ENTERPRISE
    }

    struct License {
        uint256 id;
        string key;
        LicenseType licenseType;
        LicenseStatus status;
        address owner;
        string productId;
        uint256 maxActivations;
        uint256 currentActivations;
        uint256 expiresAt;
        uint256 createdAt;
        string metadataURI; // IPFS URI for additional metadata
        bytes32 merkleRoot; // For activation verification
    }

    struct Activation {
        bytes32 hardwareId;
        uint256 timestamp;
        bool isActive;
        string metadata;
    }

    // Mappings
    mapping(uint256 => License) public licenses;
    mapping(string => uint256) public licenseKeyToId;
    mapping(uint256 => mapping(bytes32 => Activation)) public activations;
    mapping(uint256 => bytes32[]) public licenseActivations;
    mapping(address => uint256[]) public userLicenses;
    mapping(uint256 => uint256) public licenseToTokenId;

    // Events
    event LicenseCreated(
        uint256 indexed licenseId,
        string key,
        address indexed owner,
        LicenseType licenseType,
        uint256 expiresAt
    );

    event LicenseActivated(
        uint256 indexed licenseId,
        bytes32 hardwareId,
        uint256 timestamp
    );

    event LicenseDeactivated(
        uint256 indexed licenseId,
        bytes32 hardwareId,
        uint256 timestamp
    );

    event LicenseTransferred(
        uint256 indexed licenseId,
        address indexed from,
        address indexed to,
        uint256 timestamp
    );

    event LicenseStatusChanged(
        uint256 indexed licenseId,
        LicenseStatus oldStatus,
        LicenseStatus newStatus,
        uint256 timestamp
    );

    event LicenseRevoked(
        uint256 indexed licenseId,
        string reason,
        uint256 timestamp
    );

    // Modifiers
    modifier onlyLicenseOwner(uint256 licenseId) {
        require(
            licenses[licenseId].owner == msg.sender || owner() == msg.sender,
            "Not license owner"
        );
        _;
    }

    modifier licenseExists(uint256 licenseId) {
        require(licenses[licenseId].id != 0, "License does not exist");
        _;
    }

    modifier notExpired(uint256 licenseId) {
        require(
            licenses[licenseId].expiresAt == 0 ||
                licenses[licenseId].expiresAt > block.timestamp,
            "License expired"
        );
        _;
    }

    constructor() ERC721("DCA-Auth License", "DCAL") {}

    /**
     * @dev Create a new license
     */
    function createLicense(
        string memory key,
        LicenseType licenseType,
        address licenseOwner,
        string memory productId,
        uint256 maxActivations,
        uint256 expiresAt,
        string memory metadataURI
    ) external onlyOwner returns (uint256) {
        require(bytes(key).length > 0, "Invalid license key");
        require(licenseKeyToId[key] == 0, "License key already exists");
        require(licenseOwner != address(0), "Invalid owner address");

        _licenseIdCounter.increment();
        uint256 licenseId = _licenseIdCounter.current();

        licenses[licenseId] = License({
            id: licenseId,
            key: key,
            licenseType: licenseType,
            status: LicenseStatus.ACTIVE,
            owner: licenseOwner,
            productId: productId,
            maxActivations: maxActivations,
            currentActivations: 0,
            expiresAt: expiresAt,
            createdAt: block.timestamp,
            metadataURI: metadataURI,
            merkleRoot: bytes32(0)
        });

        licenseKeyToId[key] = licenseId;
        userLicenses[licenseOwner].push(licenseId);

        // Mint NFT for the license
        _tokenIdCounter.increment();
        uint256 tokenId = _tokenIdCounter.current();
        _safeMint(licenseOwner, tokenId);
        _setTokenURI(tokenId, metadataURI);
        licenseToTokenId[licenseId] = tokenId;

        emit LicenseCreated(
            licenseId,
            key,
            licenseOwner,
            licenseType,
            expiresAt
        );

        return licenseId;
    }

    /**
     * @dev Activate a license for a specific hardware
     */
    function activateLicense(
        uint256 licenseId,
        bytes32 hardwareId,
        string memory metadata,
        bytes32[] memory proof
    ) external licenseExists(licenseId) notExpired(licenseId) nonReentrant {
        License storage license = licenses[licenseId];

        require(
            license.status == LicenseStatus.ACTIVE,
            "License is not active"
        );
        require(
            msg.sender == license.owner,
            "Only license owner can activate"
        );

        // Verify merkle proof if set
        if (license.merkleRoot != bytes32(0)) {
            require(
                MerkleProof.verify(proof, license.merkleRoot, hardwareId),
                "Invalid activation proof"
            );
        }

        // Check if already activated on this hardware
        Activation storage activation = activations[licenseId][hardwareId];

        if (!activation.isActive) {
            // New activation
            require(
                license.currentActivations < license.maxActivations,
                "Max activations reached"
            );

            license.currentActivations++;
            licenseActivations[licenseId].push(hardwareId);
        }

        activation.hardwareId = hardwareId;
        activation.timestamp = block.timestamp;
        activation.isActive = true;
        activation.metadata = metadata;

        emit LicenseActivated(licenseId, hardwareId, block.timestamp);
    }

    /**
     * @dev Deactivate a license for a specific hardware
     */
    function deactivateLicense(uint256 licenseId, bytes32 hardwareId)
        external
        licenseExists(licenseId)
        onlyLicenseOwner(licenseId)
        nonReentrant
    {
        License storage license = licenses[licenseId];
        Activation storage activation = activations[licenseId][hardwareId];

        require(activation.isActive, "Not activated on this hardware");

        activation.isActive = false;
        license.currentActivations--;

        emit LicenseDeactivated(licenseId, hardwareId, block.timestamp);
    }

    /**
     * @dev Verify if a license is valid and active
     */
    function verifyLicense(uint256 licenseId, bytes32 hardwareId)
        external
        view
        licenseExists(licenseId)
        returns (
            bool isValid,
            LicenseStatus status,
            uint256 expiresAt,
            bool isActivated
        )
    {
        License memory license = licenses[licenseId];
        Activation memory activation = activations[licenseId][hardwareId];

        isValid = license.status == LicenseStatus.ACTIVE &&
            (license.expiresAt == 0 || license.expiresAt > block.timestamp);

        return (isValid, license.status, license.expiresAt, activation.isActive);
    }

    /**
     * @dev Transfer license ownership
     */
    function transferLicense(uint256 licenseId, address newOwner)
        external
        licenseExists(licenseId)
        onlyLicenseOwner(licenseId)
        nonReentrant
    {
        require(newOwner != address(0), "Invalid new owner");
        require(newOwner != licenses[licenseId].owner, "Same owner");

        address oldOwner = licenses[licenseId].owner;
        licenses[licenseId].owner = newOwner;

        // Update user licenses mapping
        _removeFromUserLicenses(oldOwner, licenseId);
        userLicenses[newOwner].push(licenseId);

        // Transfer NFT
        uint256 tokenId = licenseToTokenId[licenseId];
        if (tokenId != 0) {
            _transfer(oldOwner, newOwner, tokenId);
        }

        emit LicenseTransferred(licenseId, oldOwner, newOwner, block.timestamp);
    }

    /**
     * @dev Suspend a license
     */
    function suspendLicense(uint256 licenseId, string memory reason)
        external
        licenseExists(licenseId)
        onlyOwner
    {
        License storage license = licenses[licenseId];
        LicenseStatus oldStatus = license.status;
        license.status = LicenseStatus.SUSPENDED;

        emit LicenseStatusChanged(
            licenseId,
            oldStatus,
            LicenseStatus.SUSPENDED,
            block.timestamp
        );
    }

    /**
     * @dev Revoke a license permanently
     */
    function revokeLicense(uint256 licenseId, string memory reason)
        external
        licenseExists(licenseId)
        onlyOwner
    {
        License storage license = licenses[licenseId];
        LicenseStatus oldStatus = license.status;
        license.status = LicenseStatus.REVOKED;

        // Burn the NFT
        uint256 tokenId = licenseToTokenId[licenseId];
        if (tokenId != 0) {
            _burn(tokenId);
            delete licenseToTokenId[licenseId];
        }

        emit LicenseStatusChanged(
            licenseId,
            oldStatus,
            LicenseStatus.REVOKED,
            block.timestamp
        );
        emit LicenseRevoked(licenseId, reason, block.timestamp);
    }

    /**
     * @dev Update license merkle root for activation verification
     */
    function updateLicenseMerkleRoot(uint256 licenseId, bytes32 merkleRoot)
        external
        licenseExists(licenseId)
        onlyLicenseOwner(licenseId)
    {
        licenses[licenseId].merkleRoot = merkleRoot;
    }

    /**
     * @dev Get user's licenses
     */
    function getUserLicenses(address user)
        external
        view
        returns (uint256[] memory)
    {
        return userLicenses[user];
    }

    /**
     * @dev Get license by key
     */
    function getLicenseByKey(string memory key)
        external
        view
        returns (License memory)
    {
        uint256 licenseId = licenseKeyToId[key];
        require(licenseId != 0, "License not found");
        return licenses[licenseId];
    }

    /**
     * @dev Get license activations
     */
    function getLicenseActivations(uint256 licenseId)
        external
        view
        licenseExists(licenseId)
        returns (bytes32[] memory)
    {
        return licenseActivations[licenseId];
    }

    /**
     * @dev Batch verify licenses
     */
    function batchVerifyLicenses(
        uint256[] memory licenseIds,
        bytes32[] memory hardwareIds
    )
        external
        view
        returns (bool[] memory validities)
    {
        require(
            licenseIds.length == hardwareIds.length,
            "Arrays length mismatch"
        );

        validities = new bool[](licenseIds.length);

        for (uint256 i = 0; i < licenseIds.length; i++) {
            License memory license = licenses[licenseIds[i]];
            Activation memory activation = activations[licenseIds[i]][
                hardwareIds[i]
            ];

            validities[i] =
                license.id != 0 &&
                license.status == LicenseStatus.ACTIVE &&
                (license.expiresAt == 0 ||
                    license.expiresAt > block.timestamp) &&
                activation.isActive;
        }

        return validities;
    }

    /**
     * @dev Helper function to remove license from user's list
     */
    function _removeFromUserLicenses(address user, uint256 licenseId)
        private
    {
        uint256[] storage licenses = userLicenses[user];
        for (uint256 i = 0; i < licenses.length; i++) {
            if (licenses[i] == licenseId) {
                licenses[i] = licenses[licenses.length - 1];
                licenses.pop();
                break;
            }
        }
    }

    /**
     * @dev Override functions for NFT functionality
     */
    function _burn(uint256 tokenId)
        internal
        override(ERC721, ERC721URIStorage)
    {
        super._burn(tokenId);
    }

    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }
}