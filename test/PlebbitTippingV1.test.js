const semver = require('semver');
const minVersion = '20.19.0';

if (!semver.satisfies(process.version, '>=' + minVersion)) {
  console.error(`Node.js ${minVersion} or higher is required. Current version: ${process.version}`);
  process.exit(1);
}

const { ethers } = require("hardhat");
const { expect } = require("chai");

const toWei = (value) => ethers.parseEther(value.toString());
const fromWei = (value) => parseFloat(ethers.formatEther(value));

describe("PlebbitTippingV1", function () {
    let PlebbitTippingV1, plebbitTipping, admin, mod, user1, user2;
    const initialMinimumTipAmount = toWei("0.001");
    const initialFeePercent = 5;

    beforeEach(async function () {
        [admin, mod, user1, user2, ...addrs] = await ethers.getSigners();
        PlebbitTippingV1 = await ethers.getContractFactory("PlebbitTippingV1");
        plebbitTipping = await PlebbitTippingV1.deploy(initialMinimumTipAmount, initialFeePercent);
        await plebbitTipping.waitForDeployment();
        await plebbitTipping.grantRole(await plebbitTipping.MODERATOR_ROLE(), mod.address);

        // Log the deployed address
        console.log("Test deployed PlebbitTippingV1 at:", plebbitTipping.target || plebbitTipping.address);
    });

    it("Admin can set roles, mods can change mod functions, public can't", async function () {
        await plebbitTipping.connect(admin).grantRole(await plebbitTipping.MODERATOR_ROLE(), user1.address);
        await expect(
            plebbitTipping.connect(user2).setMinimumTipAmount(toWei("0.01"))
        ).to.be.reverted;
    });

    it("Tip function: respects minimumTipAmount, computes and distributes fee, emits event", async function () {
        await expect(
            plebbitTipping.connect(user1).tip(user2.address, toWei("0.0001"), mod.address, ethers.ZeroHash, ethers.ZeroHash, { value: toWei("0.0001"), })
        ).to.be.revertedWith("Tip amount is too low");
        
        await expect(plebbitTipping.connect(user1).tip(
            user2.address, 
            toWei("0.01"), 
            mod.address, 
            ethers.ZeroHash, 
            ethers.ZeroHash, 
            { value: toWei("0.01") })
        ).to.emit(plebbitTipping, "Tip");

        const balanceMod = await ethers.provider.getBalance(mod.address);
        const balanceUser2 = await ethers.provider.getBalance(user2.address);
        // Calculate delta to check balance changes
        const deltaMod = parseFloat((fromWei(balanceMod) - 10000).toFixed(4));
        const deltaUser2 = parseFloat((fromWei(balanceUser2) - 10000).toFixed(4));

        expect(deltaMod).to.be.closeTo(0.0005, 0.0001);
        expect(deltaUser2).to.be.closeTo(0.0095, 0.0001);
    });

    it("After tipping, can retrieve correct total and filtered amounts", async function () {
        const feeRecipients = [mod.address];
        const recipientCommentCid = ethers.ZeroHash;
        const senderCommentCid = ethers.ZeroHash;
        await plebbitTipping.connect(user1).tip(
            user2.address,
            toWei("0.01"),
            mod.address,
            senderCommentCid,
            recipientCommentCid,
            { value: toWei("0.01") }
        );

        const totalAmount = await plebbitTipping.getTipsTotalAmount(recipientCommentCid, feeRecipients);
        expect(fromWei(totalAmount)).to.equal(0.01);
    });

    it("Offset and limit work correctly in listing tips", async function () {
        const feeRecipients = [mod.address];
        const recipientCommentCid = ethers.ZeroHash;
        const senderCommentCid = ethers.ZeroHash;

        for (let i = 0; i < 5; i++) {
            await plebbitTipping.connect(user1).tip(user2.address, toWei("0.01"), mod.address, senderCommentCid, recipientCommentCid, { value: toWei("0.01") });
        }

        const tips = await plebbitTipping.getTips(recipientCommentCid, feeRecipients, 1, 3);
        expect(tips.length).to.equal(3);

        // Test empty offset
        const emptyTips = await plebbitTipping.getTips(recipientCommentCid, feeRecipients, 10, 3);
        expect(emptyTips.length).to.equal(0);
    });

    it("Comprehensive filtering tests with multiple tips and fee recipients", async function () {
        const feeRecipient1 = mod.address;
        const feeRecipient2 = user2.address;
        const recipientCommentCid1 = ethers.keccak256(ethers.toUtf8Bytes("comment1"));
        const recipientCommentCid2 = ethers.keccak256(ethers.toUtf8Bytes("comment2"));
        const senderCommentCid1 = ethers.keccak256(ethers.toUtf8Bytes("sender1"));
        const senderCommentCid2 = ethers.keccak256(ethers.toUtf8Bytes("sender2"));

        // Add tips with different combinations
        await plebbitTipping.connect(user1).tip(user2.address, toWei("0.01"), feeRecipient1, senderCommentCid1, recipientCommentCid1, { value: toWei("0.01") });
        await plebbitTipping.connect(user1).tip(user2.address, toWei("0.02"), feeRecipient1, senderCommentCid1, recipientCommentCid1, { value: toWei("0.02") });
        await plebbitTipping.connect(user1).tip(user2.address, toWei("0.03"), feeRecipient2, senderCommentCid2, recipientCommentCid2, { value: toWei("0.03") });
        await plebbitTipping.connect(user2).tip(user1.address, toWei("0.04"), feeRecipient1, senderCommentCid1, recipientCommentCid1, { value: toWei("0.04") });

        // Test getTipsTotalAmount with specific feeRecipients
        const totalAmount1 = await plebbitTipping.getTipsTotalAmount(recipientCommentCid1, [feeRecipient1]);
        expect(fromWei(totalAmount1)).to.equal(0.07); // 0.01 + 0.02 + 0.04

        const totalAmount2 = await plebbitTipping.getTipsTotalAmount(recipientCommentCid2, [feeRecipient2]);
        expect(fromWei(totalAmount2)).to.equal(0.03);

        // Test getSenderTipsTotalAmount with filtering
        const senderTotal = await plebbitTipping.getSenderTipsTotalAmount(senderCommentCid1, user1.address, recipientCommentCid1, [feeRecipient1]);
        expect(fromWei(senderTotal)).to.equal(0.03); // 0.01 + 0.02
    });

    it("Test multiple comment CIDs with same fee recipients", async function () {
        const feeRecipients = [mod.address, user2.address];
        const recipientCommentCid1 = ethers.keccak256(ethers.toUtf8Bytes("comment1"));
        const recipientCommentCid2 = ethers.keccak256(ethers.toUtf8Bytes("comment2"));
        const senderCommentCid = ethers.keccak256(ethers.toUtf8Bytes("sender1"));

        // Add tips for different comments
        await plebbitTipping.connect(user1).tip(user2.address, toWei("0.01"), feeRecipients[0], senderCommentCid, recipientCommentCid1, { value: toWei("0.01") });
        await plebbitTipping.connect(user1).tip(user2.address, toWei("0.02"), feeRecipients[1], senderCommentCid, recipientCommentCid1, { value: toWei("0.02") });
        await plebbitTipping.connect(user1).tip(user2.address, toWei("0.03"), feeRecipients[0], senderCommentCid, recipientCommentCid2, { value: toWei("0.03") });
        await plebbitTipping.connect(user1).tip(user2.address, toWei("0.04"), feeRecipients[1], senderCommentCid, recipientCommentCid2, { value: toWei("0.04") });

        // Test getTipsTotalAmountsSameFeeRecipients
        const totals = await plebbitTipping.getTipsTotalAmountsSameFeeRecipients([recipientCommentCid1, recipientCommentCid2], feeRecipients);
        expect(fromWei(totals[0])).to.equal(0.03); // 0.01 + 0.02
        expect(fromWei(totals[1])).to.equal(0.07); // 0.03 + 0.04

        // Test getSenderTipsTotalAmountsSameFeeRecipients
        const senderTotals = await plebbitTipping.getSenderTipsTotalAmountsSameFeeRecipients(senderCommentCid, user1.address, [recipientCommentCid1, recipientCommentCid2], feeRecipients);
        expect(fromWei(senderTotals[0])).to.equal(0.03); // 0.01 + 0.02
        expect(fromWei(senderTotals[1])).to.equal(0.07); // 0.03 + 0.04
    });

    it("Test admin and moderator functions", async function () {
        // Test moderator can change settings
        await plebbitTipping.connect(mod).setMinimumTipAmount(toWei("0.01"));
        expect(fromWei(await plebbitTipping.minimumTipAmount())).to.equal(0.01);

        await plebbitTipping.connect(mod).setFeePercent(10);
        expect(await plebbitTipping.feePercent()).to.equal(10);

        // Test fee percent validation
        await expect(
            plebbitTipping.connect(mod).setFeePercent(0)
        ).to.be.revertedWith("Fee percent must be between 1 and 20");

        await expect(
            plebbitTipping.connect(mod).setFeePercent(21)
        ).to.be.revertedWith("Fee percent must be between 1 and 20");

        // Test non-moderator can't change settings
        await expect(
            plebbitTipping.connect(user1).setMinimumTipAmount(toWei("0.02"))
        ).to.be.reverted;
    });

    it("Test getTipsAmounts function", async function () {
        const feeRecipients = [mod.address];
        const recipientCommentCid = ethers.ZeroHash;
        const senderCommentCid = ethers.ZeroHash;

        // Add tips with different amounts
        await plebbitTipping.connect(user1).tip(user2.address, toWei("0.01"), mod.address, senderCommentCid, recipientCommentCid, { value: toWei("0.01") });
        await plebbitTipping.connect(user1).tip(user2.address, toWei("0.02"), mod.address, senderCommentCid, recipientCommentCid, { value: toWei("0.02") });
        await plebbitTipping.connect(user1).tip(user2.address, toWei("0.03"), mod.address, senderCommentCid, recipientCommentCid, { value: toWei("0.03") });

        // Test getting amounts with offset and limit
        const amounts = await plebbitTipping.getTipsAmounts(recipientCommentCid, feeRecipients, 1, 2);
        expect(amounts.length).to.equal(2);
        expect(fromWei(amounts[0])).to.equal(0.02);
        expect(fromWei(amounts[1])).to.equal(0.03);
    });

    it("Test event emission", async function () {
        const recipientCommentCid = ethers.keccak256(ethers.toUtf8Bytes("comment1"));
        const senderCommentCid = ethers.keccak256(ethers.toUtf8Bytes("sender1"));

        await expect(
            plebbitTipping.connect(user1).tip(
                user2.address,
                toWei("0.01"),
                mod.address,
                senderCommentCid,
                recipientCommentCid,
                { value: toWei("0.01") }
            )
        ).to.emit(plebbitTipping, "Tip")
        .withArgs(
            user1.address,
            user2.address,
            toWei("0.01"),
            mod.address,
            recipientCommentCid,
            senderCommentCid
        );
    });

    it("Test value mismatch validation", async function () {
        await expect(
            plebbitTipping.connect(user1).tip(
                user2.address,
                toWei("0.01"),
                mod.address,
                ethers.ZeroHash,
                ethers.ZeroHash,
                { value: toWei("0.02") } // Different from amount
            )
        ).to.be.revertedWith("Sent value doesn't match amount");
    });
});

