// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/AccessControl.sol";

contract PlebbitTippingV1 is AccessControl {
    struct Tip {
        uint96 amount; // uint96 to save gas, works with eth but not with erc20
        address feeRecipient; // needed for getTips(feeRecipients)
        address sender; // needed for getSenderTipsTotalAmount(sender)
        bytes32 senderCommentCid; // needed for getSenderTipsTotalAmount(senderCommentCid), 0x0 if no comment
    }

    mapping(bytes32 => Tip[]) public tips; // keccak256(abi.encodePacked(recipientCid, feeRecipient)) => Tip[]
    mapping(bytes32 => uint256) public tipsTotalAmounts; // keccak256(abi.encodePacked(recipientCid, feeRecipient)) => uint256
    mapping(bytes32 => uint256) public senderTipsTotalAmounts; // keccak256(abi.encode(senderCommentCid, sender, recipientCid, feeRecipient)) => uint256

    uint256 public minimumTipAmount; // admin can change
    uint256 public feePercent; // admin can change, between 1 and 20

    bytes32 public constant MODERATOR_ROLE = keccak256("MODERATOR_ROLE");

    event TipEvent(
        address indexed sender,
        address indexed recipient,
        uint256 amount,
        address indexed feeRecipient,
        bytes32 recipientCommentCid,
        bytes32 senderCommentCid // 0x0 if no comment
    );

    constructor(uint256 _minimumTipAmount, uint256 _feePercent) {
        minimumTipAmount = _minimumTipAmount;
        feePercent = _feePercent;
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function tip(
        address recipient,
        uint256 amount,
        address feeRecipient,
        bytes32 senderCommentCid,
        bytes32 recipientCommentCid
    ) external payable {
        require(msg.value >= minimumTipAmount, "Tip amount is too low");
        require(msg.value == amount, "Sent value doesn't match amount");
        
        uint256 fee = (amount * feePercent) / 100;
        uint256 receivedAmount = amount - fee;

        payable(feeRecipient).transfer(fee);
        payable(recipient).transfer(receivedAmount);

        bytes32 tipKey = keccak256(abi.encodePacked(recipientCommentCid, feeRecipient));
        tips[tipKey].push(Tip(uint96(amount), feeRecipient, msg.sender, senderCommentCid));
        tipsTotalAmounts[tipKey] += amount;

        bytes32 senderTipKey = keccak256(abi.encode(senderCommentCid, msg.sender, recipientCommentCid, feeRecipient));
        senderTipsTotalAmounts[senderTipKey] += amount;

        emit TipEvent(msg.sender, recipient, amount, feeRecipient, recipientCommentCid, senderCommentCid);
    }

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

    function getSenderTipsTotalAmount(
        bytes32 senderCommentCid,
        address sender,
        bytes32 recipientCommentCid,
        address[] calldata feeRecipients
    ) external view returns (uint256) {
        uint256 total = 0;
        for (uint256 i = 0; i < feeRecipients.length; i++) {
            bytes32 senderTipKey = keccak256(abi.encode(senderCommentCid, sender, recipientCommentCid, feeRecipients[i]));
            total += senderTipsTotalAmounts[senderTipKey];
        }
        return total;
    }

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
    function setMinimumTipAmount(uint256 _minimumTipAmount) external onlyRole(MODERATOR_ROLE) {
        minimumTipAmount = _minimumTipAmount;
    }

    function setFeePercent(uint256 _feePercent) external onlyRole(MODERATOR_ROLE) {
        require(_feePercent >= 1 && _feePercent <= 20, "Fee percent must be between 1 and 20");
        feePercent = _feePercent;
    }
}
