// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title PlebbitTippingV1
 * @notice A contract for tipping users with ETH, supporting fee recipients and comment-based tracking.
 * @dev Uses AccessControl for moderator/admin permissions.
 */
contract PlebbitTippingV1 is AccessControl {
    /**
     * @notice Struct representing a single tip.
     * @param amount The amount of ETH tipped (uint96 for gas savings).
     * @param feeRecipient The address receiving the fee portion.
     * @param sender The address of the tip sender.
     * @param senderCommentCid Optional comment CID from the sender (0x0 if none).
     */
    struct Tip {
        uint96 amount;
        address feeRecipient;
        address sender;
        bytes32 senderCommentCid;
    }

    /// @notice Maps (recipientCommentCid, feeRecipient) to an array of tips.
    mapping(bytes32 => Tip[]) public tips;

    /// @notice Maps (recipientCommentCid, feeRecipient) to the total amount tipped.
    mapping(bytes32 => uint256) public tipsTotalAmounts;

    /// @notice Maps (senderCommentCid, sender, recipientCommentCid, feeRecipient) to the total amount tipped by sender.
    mapping(bytes32 => uint256) public senderTipsTotalAmounts;

    /// @notice The minimum allowed tip amount (in wei). Can be changed by a moderator.
    uint256 public minimumTipAmount;

    /// @notice The fee percentage (between 1 and 20). Can be changed by a moderator.
    uint256 public feePercent;

    /// @notice Role identifier for moderators.
    bytes32 public constant MODERATOR_ROLE = keccak256("MODERATOR_ROLE");

    /**
     * @notice Emitted when a tip is sent.
     * @param sender The address sending the tip.
     * @param recipient The address receiving the tip.
     * @param amount The total amount tipped.
     * @param feeRecipient The address receiving the fee.
     * @param recipientCommentCid The comment CID of the recipient.
     * @param senderCommentCid The comment CID of the sender (0x0 if none).
     */
    event TipEvent(
        address indexed sender,
        address indexed recipient,
        uint256 amount,
        address indexed feeRecipient,
        bytes32 recipientCommentCid,
        bytes32 senderCommentCid
    );

    /**
     * @notice Contract constructor.
     * @param _minimumTipAmount The minimum tip amount (in wei).
     * @param _feePercent The fee percentage (between 1 and 20).
     */
    constructor(uint256 _minimumTipAmount, uint256 _feePercent) {
        minimumTipAmount = _minimumTipAmount;
        feePercent = _feePercent;
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /**
     * @notice Send a tip to a recipient, with a portion going to a fee recipient.
     * @dev The tip is tracked by both recipient and sender comment CIDs.
     * @param recipient The address to receive the tip.
     * @param amount The total amount to tip (must match msg.value).
     * @param feeRecipient The address to receive the fee.
     * @param senderCommentCid Optional comment CID from the sender (0x0 if none).
     * @param recipientCommentCid The comment CID of the recipient.
     */
    function tip(
        address recipient,
        uint256 amount,
        address feeRecipient,
        bytes32 senderCommentCid,
        bytes32 recipientCommentCid
    ) external payable {
        require(msg.value >= minimumTipAmount, "Tip amount is too low");
        require(msg.value == amount, "Sent value doesn't match amount");
        
        // Calculate fee and recipient amount
        uint256 fee = (amount * feePercent) / 100;
        uint256 receivedAmount = amount - fee;

        // Transfer fee and tip
        payable(feeRecipient).transfer(fee);
        payable(recipient).transfer(receivedAmount);

        // Track tip by recipient comment and fee recipient
        bytes32 tipKey = keccak256(abi.encodePacked(recipientCommentCid, feeRecipient));
        tips[tipKey].push(Tip(uint96(amount), feeRecipient, msg.sender, senderCommentCid));
        tipsTotalAmounts[tipKey] += amount;

        // Track total tipped by sender for this combination
        bytes32 senderTipKey = keccak256(abi.encode(senderCommentCid, msg.sender, recipientCommentCid, feeRecipient));
        senderTipsTotalAmounts[senderTipKey] += amount;

        emit TipEvent(msg.sender, recipient, amount, feeRecipient, recipientCommentCid, senderCommentCid);
    }

    /**
     * @notice Get the total amount tipped for a recipient comment and a list of fee recipients.
     * @param recipientCommentCid The comment CID of the recipient.
     * @param feeRecipients The list of fee recipient addresses.
     * @return total The total amount tipped for the given parameters.
     */
    function getTipsTotalAmount(
        bytes32 recipientCommentCid,
        address[] calldata feeRecipients
    ) external view returns (uint256) {
        uint256 total = 0;
        for (uint256 i = 0; i < feeRecipients.length; i++) {
            bytes32 tipKey = keccak256(abi.encodePacked(recipientCommentCid, feeRecipients[i]));
            total += tipsTotalAmounts[tipKey];
        }
        return total;
    }

    /**
     * @notice Get the total amounts tipped for multiple recipient comments and fee recipients.
     * @param recipientCommentCids Array of recipient comment CIDs.
     * @param feeRecipients Array of arrays of fee recipient addresses.
     * @return totals Array of total amounts for each recipient comment.
     */
    function getTipsTotalAmounts(
        bytes32[] calldata recipientCommentCids,
        address[][] calldata feeRecipients
    ) external view returns (uint256[] memory) {
        require(recipientCommentCids.length == feeRecipients.length, "Arrays length mismatch");
        uint256[] memory totals = new uint256[](recipientCommentCids.length);
        
        for (uint256 i = 0; i < recipientCommentCids.length; i++) {
            for (uint256 j = 0; j < feeRecipients[i].length; j++) {
                bytes32 tipKey = keccak256(abi.encodePacked(recipientCommentCids[i], feeRecipients[i][j]));
                totals[i] += tipsTotalAmounts[tipKey];
            }
        }
        return totals;
    }

    /**
     * @notice Get the total amounts tipped for multiple recipient comments, using the same fee recipients for each.
     * @param recipientCommentCids Array of recipient comment CIDs.
     * @param feeRecipients Array of fee recipient addresses.
     * @return totals Array of total amounts for each recipient comment.
     */
    function getTipsTotalAmountsSameFeeRecipients(
        bytes32[] calldata recipientCommentCids,
        address[] calldata feeRecipients
    ) external view returns (uint256[] memory) {
        uint256[] memory totals = new uint256[](recipientCommentCids.length);
        
        for (uint256 i = 0; i < recipientCommentCids.length; i++) {
            for (uint256 j = 0; j < feeRecipients.length; j++) {
                bytes32 tipKey = keccak256(abi.encodePacked(recipientCommentCids[i], feeRecipients[j]));
                totals[i] += tipsTotalAmounts[tipKey];
            }
        }
        return totals;
    }

    /**
     * @notice Get the amounts of individual tips for a recipient comment and fee recipients, with pagination.
     * @param recipientCommentCid The comment CID of the recipient.
     * @param feeRecipients The list of fee recipient addresses.
     * @param offset The starting index for pagination.
     * @param limit The maximum number of results to return.
     * @return amounts Array of tip amounts.
     */
    function getTipsAmounts(
        bytes32 recipientCommentCid,
        address[] calldata feeRecipients,
        uint256 offset,
        uint256 limit
    ) external view returns (uint256[] memory amounts) {
        uint256 totalTips = 0;
        
        // Count total tips across all feeRecipients
        for (uint256 i = 0; i < feeRecipients.length; i++) {
            bytes32 tipKey = keccak256(abi.encodePacked(recipientCommentCid, feeRecipients[i]));
            totalTips += tips[tipKey].length;
        }
        
        if (offset >= totalTips) {
            return new uint256[](0);
        }
        
        uint256 maxResults = limit;
        if (offset + limit > totalTips) {
            maxResults = totalTips - offset;
        }
        
        amounts = new uint256[](maxResults);
        uint256 currentIndex = 0;
        uint256 resultIndex = 0;
        
        for (uint256 i = 0; i < feeRecipients.length && resultIndex < maxResults; i++) {
            bytes32 tipKey = keccak256(abi.encodePacked(recipientCommentCid, feeRecipients[i]));
            Tip[] storage tipArray = tips[tipKey];
            
            for (uint256 j = 0; j < tipArray.length && resultIndex < maxResults; j++) {
                if (currentIndex >= offset) {
                    amounts[resultIndex] = tipArray[j].amount;
                    resultIndex++;
                }
                currentIndex++;
            }
        }
        
        return amounts;
    }

    /**
     * @notice Get the Tip structs for a recipient comment and fee recipients, with pagination.
     * @param recipientCommentCid The comment CID of the recipient.
     * @param feeRecipients The list of fee recipient addresses.
     * @param offset The starting index for pagination.
     * @param limit The maximum number of results to return.
     * @return result Array of Tip structs.
     */
    function getTips(
        bytes32 recipientCommentCid,
        address[] calldata feeRecipients,
        uint256 offset,
        uint256 limit
    ) external view returns (Tip[] memory) {
        uint256 totalTips = 0;
        
        // Count total tips across all feeRecipients
        for (uint256 i = 0; i < feeRecipients.length; i++) {
            bytes32 tipKey = keccak256(abi.encodePacked(recipientCommentCid, feeRecipients[i]));
            totalTips += tips[tipKey].length;
        }
        
        if (offset >= totalTips) {
            return new Tip[](0);
        }
        
        uint256 maxResults = limit;
        if (offset + limit > totalTips) {
            maxResults = totalTips - offset;
        }
        
        Tip[] memory result = new Tip[](maxResults);
        uint256 currentIndex = 0;
        uint256 resultIndex = 0;
        
        for (uint256 i = 0; i < feeRecipients.length && resultIndex < maxResults; i++) {
            bytes32 tipKey = keccak256(abi.encodePacked(recipientCommentCid, feeRecipients[i]));
            Tip[] storage tipArray = tips[tipKey];
            
            for (uint256 j = 0; j < tipArray.length && resultIndex < maxResults; j++) {
                if (currentIndex >= offset) {
                    result[resultIndex] = tipArray[j];
                    resultIndex++;
                }
                currentIndex++;
            }
        }
        
        return result;
    }

    /**
     * @notice Get the total amount tipped by a sender for a given sender comment, recipient comment, and fee recipients.
     * @param senderCommentCid The comment CID from the sender (0x0 if none).
     * @param sender The address of the tip sender.
     * @param recipientCommentCid The comment CID of the recipient.
     * @param feeRecipients The list of fee recipient addresses.
     * @return total The total amount tipped by the sender for these parameters.
     */
    function getSenderTipsTotalAmount(
        bytes32 senderCommentCid,
        address sender,
        bytes32 recipientCommentCid,
        address[] calldata feeRecipients
    ) external view returns (uint256) {
        uint256 total = 0;
        for (uint256 i = 0; i < feeRecipients.length; i++) {
            // Generate a unique key for this combination of sender, comments, and fee recipient
            bytes32 senderTipKey = keccak256(abi.encode(senderCommentCid, sender, recipientCommentCid, feeRecipients[i]));
            total += senderTipsTotalAmounts[senderTipKey];
        }
        return total;
    }

    /**
     * @notice Get the total amounts tipped by a sender for multiple recipient comments and fee recipients.
     * @param senderCommentCid The comment CID from the sender (0x0 if none).
     * @param sender The address of the tip sender.
     * @param recipientCommentCids Array of recipient comment CIDs.
     * @param feeRecipients Array of arrays of fee recipient addresses.
     * @return totals Array of total amounts for each recipient comment.
     */
    function getSenderTipsTotalAmounts(
        bytes32 senderCommentCid,
        address sender,
        bytes32[] calldata recipientCommentCids,
        address[][] calldata feeRecipients
    ) external view returns (uint256[] memory) {
        require(recipientCommentCids.length == feeRecipients.length, "Arrays length mismatch");
        uint256[] memory totals = new uint256[](recipientCommentCids.length);
        
        for (uint256 i = 0; i < recipientCommentCids.length; i++) {
            for (uint256 j = 0; j < feeRecipients[i].length; j++) {
                bytes32 senderTipKey = keccak256(abi.encode(senderCommentCid, sender, recipientCommentCids[i], feeRecipients[i][j]));
                totals[i] += senderTipsTotalAmounts[senderTipKey];
            }
        }
        return totals;
    }

    /**
     * @notice Get the total amounts tipped by a sender for multiple recipient comments, using the same fee recipients for each.
     * @param senderCommentCid The comment CID from the sender (0x0 if none).
     * @param sender The address of the tip sender.
     * @param recipientCommentCids Array of recipient comment CIDs.
     * @param feeRecipients Array of fee recipient addresses.
     * @return totals Array of total amounts for each recipient comment.
     */
    function getSenderTipsTotalAmountsSameFeeRecipients(
        bytes32 senderCommentCid,
        address sender,
        bytes32[] calldata recipientCommentCids,
        address[] calldata feeRecipients
    ) external view returns (uint256[] memory) {
        uint256[] memory totals = new uint256[](recipientCommentCids.length);
        
        for (uint256 i = 0; i < recipientCommentCids.length; i++) {
            for (uint256 j = 0; j < feeRecipients.length; j++) {
                bytes32 senderTipKey = keccak256(abi.encode(senderCommentCid, sender, recipientCommentCids[i], feeRecipients[j]));
                totals[i] += senderTipsTotalAmounts[senderTipKey];
            }
        }
        return totals;
    }

    // Admin functions

    /**
     * @notice Set the minimum allowed tip amount.
     * @dev Only callable by accounts with MODERATOR_ROLE.
     * @param _minimumTipAmount The new minimum tip amount (in wei).
     */
    function setMinimumTipAmount(uint256 _minimumTipAmount) external onlyRole(MODERATOR_ROLE) {
        minimumTipAmount = _minimumTipAmount;
    }

    /**
     * @notice Set the fee percentage.
     * @dev Only callable by accounts with MODERATOR_ROLE. Must be between 1 and 20.
     * @param _feePercent The new fee percentage.
     */
    function setFeePercent(uint256 _feePercent) external onlyRole(MODERATOR_ROLE) {
        require(_feePercent >= 1 && _feePercent <= 20, "Fee percent must be between 1 and 20");
        feePercent = _feePercent;
    }
}
