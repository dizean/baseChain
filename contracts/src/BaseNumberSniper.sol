// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/*
  BaseNumberSniper.sol
  - ERC20 token "BASE" is implemented inline (OpenZeppelin style).
  - Chainlink VRFv2 is used to produce a daily secret number (0-99).
  - Players pick a number (0-99) and buy one of three packs:
      * 3 guesses pack — cost 15 BASE
      * 5 guesses pack — cost 10 BASE
      * 8 guesses pack — cost 3 BASE
    (User picks N distinct guesses in a single play).
  - On VRF fulfillment for the round, contract computes winners and
    auto-distributes reward amounts (transfer BASE).
  - Exact match pays 2x the stake (per your request). Tiers for close guesses
    give partial rewards. See comments for payout percentages.
  - NOTE: This simple implementation iterates over plays in the round on fulfill.
    For production at scale, consider off-chain indexing or batched claim flows.
*/

import {ERC20} from "openzeppelin-contracts/token/ERC20/ERC20.sol";
import {VRFCoordinatorV2Interface} from "chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";
import {VRFConsumerBaseV2} from "chainlink/contracts/src/v0.8/VRFConsumerBaseV2.sol";

contract BaseNumberSniper is ERC20, VRFConsumerBaseV2 {
    // ---------- Game settings ----------
    struct Play {
        address player;
        uint8[] guesses; // guesses 0..99
        uint256 stake;   // amount of BASE tokens staked for this play
    }

    struct Round {
        uint256 roundId;
        uint256 totalPool;
        bool randomRequested;
        bool fulfilled;
        uint8 secret; // 0-99 after fulfillment
        Play[] plays;
    }

    mapping(uint256 => Round) public rounds; // roundKey (day index) => Round
    mapping(uint256 => uint256) public vrfRequestToRoundKey; // requestId -> roundKey

    uint256 public immutable startTimestamp; // anchor for day 0
    uint256 public constant DAY = 1 days;

    // pack costs (in BASE)
    uint256 public constant PACK_3_COST = 15 * (10**18);
    uint256 public constant PACK_5_COST = 10 * (10**18);
    uint256 public constant PACK_8_COST = 3  * (10**18);

    // payout multipliers (expressed in basis points, 10000 == 100%)
    // exact match: 200% (2x stake) => 20000 bps. We'll transfer stake*2.
    uint256 public constant EXACT_PAYOUT_BP = 20000;

    // close tiers (example: distance 1 => 50% payout, distance 2 => 25% payout)
    uint256 public constant DIST1_PAYOUT_BP = 5000; // 50%
    uint256 public constant DIST2_PAYOUT_BP = 2500; // 25%

    // VRF variables (set at constructor)
    VRFCoordinatorV2Interface COORDINATOR;
    uint64 s_subscriptionId;
    bytes32 keyHash;
    uint32 callbackGasLimit = 2000000;
    uint16 requestConfirmations = 3;
    uint32 numWords = 1;

    // owner
    address public owner;

    // ---------- Events ----------
    event PlayCreated(address indexed player, uint256 indexed roundKey, uint256 stake, uint8[] guesses);
    event RandomRequested(uint256 indexed roundKey, uint256 requestId);
    event RoundFulfilled(uint256 indexed roundKey, uint8 secret);

    // ---------- Modifiers ----------
    modifier onlyOwner() {
        require(msg.sender == owner, "only owner");
        _;
    }

    // ---------- Constructor ----------
    constructor(
        string memory tokenName,
        string memory tokenSymbol,
        address vrfCoordinator,
        bytes32 _keyHash,
        uint64 subscriptionId
    ) ERC20(tokenName, tokenSymbol) VRFConsumerBaseV2(vrfCoordinator) {
        owner = msg.sender;
        startTimestamp = block.timestamp;
        COORDINATOR = VRFCoordinatorV2Interface(vrfCoordinator);
        keyHash = _keyHash;
        s_subscriptionId = subscriptionId;

        // mint initial supply to deployer for distribution / liquidity / airdrops
        uint256 initial = 1_000_000 * 10**decimals();
        _mint(msg.sender, initial);
    }

    // ---------- Helpers ----------
    function todayKey() public view returns (uint256) {
        return (block.timestamp - startTimestamp) / DAY;
    }

    // Returns round; creates if not exists
    function _ensureRound(uint256 roundKey) internal returns (Round storage) {
        Round storage r = rounds[roundKey];
        if (r.roundId == 0 && r.plays.length == 0 && r.totalPool == 0 && !r.randomRequested && !r.fulfilled) {
            r.roundId = roundKey + 1; // non-zero ID
        }
        return r;
    }

    // ---------- Player-facing: Play ----------
    // Player must have approved this contract to spend their BASE tokens before calling.
    // guesses must be unique (contract enforces).
    function play(uint8[] calldata guesses, uint8 packChoice) external {
        require(guesses.length > 0 && guesses.length <= 8, "invalid guesses length");

        // map packChoice -> cost + expected guesses
        uint256 cost;
        if (packChoice == 3) { // pack "3 guesses" costs 15 BASE
            require(guesses.length == 3, "pack 3 requires 3 guesses");
            cost = PACK_3_COST;
        } else if (packChoice == 5) {
            require(guesses.length == 5, "pack 5 requires 5 guesses");
            cost = PACK_5_COST;
        } else if (packChoice == 8) {
            require(guesses.length == 8, "pack 8 requires 8 guesses");
            cost = PACK_8_COST;
        } else {
            revert("invalid packChoice");
        }

        // validate guesses 0..99 and uniqueness
        bool[100] memory seen;
        for (uint i = 0; i < guesses.length; i++) {
            require(guesses[i] <= 99, "guess out of range");
            require(!seen[guesses[i]], "duplicate guesses not allowed");
            seen[guesses[i]] = true;
        }

        // take tokens from player
        bool ok = transferFrom(msg.sender, address(this), cost);
        require(ok, "token transfer failed");

        uint256 rk = todayKey();
        Round storage r = _ensureRound(rk);
        r.totalPool += cost;

        // record play
        r.plays.push(Play({
            player: msg.sender,
            guesses: guesses,
            stake: cost
        }));

        emit PlayCreated(msg.sender, rk, cost, guesses);
    }

    // ---------- Admin / automation: request random for a round ----------
    // Anyone can trigger a round's randomness request (gas payer).
    // In production you might have an off-chain scheduler call this at the desired time.
    function requestRoundRandom(uint256 roundKey) external returns (uint256 requestId) {
        Round storage r = _ensureRound(roundKey);
        require(!r.randomRequested, "already requested");
        require(!r.fulfilled, "already fulfilled");

        // request randomness
        requestId = COORDINATOR.requestRandomWords(
            keyHash,
            s_subscriptionId,
            requestConfirmations,
            callbackGasLimit,
            numWords
        );

        vrfRequestToRoundKey[requestId] = roundKey;
        r.randomRequested = true;

        emit RandomRequested(roundKey, requestId);
    }

    // ---------- VRF callback ----------
    // Called by Chainlink VRF coordinator
    function fulfillRandomWords(uint256 requestId, uint256[] memory randomWords) internal override {
        uint256 roundKey = vrfRequestToRoundKey[requestId];
        Round storage r = rounds[roundKey];
        require(!r.fulfilled, "already fulfilled");

        uint8 secret = uint8(randomWords[0] % 100); // 0..99
        r.secret = secret;
        r.fulfilled = true;

        // distribute rewards: iterate plays
        // For each play, check if any guess matches, calculate payout (in BASE), and transfer
        // Payout logic:
        // - exact match: payout = stake * 2 (i.e. reward = stake * 2)
        // - distance == 1: payout = stake * 50%
        // - distance == 2: payout = stake * 25%
        // - else: nothing

        for (uint i = 0; i < r.plays.length; i++) {
            Play storage p = r.plays[i];
            uint256 payout = 0;
            // loop guesses for that play
            for (uint j = 0; j < p.guesses.length; j++) {
                uint8 g = p.guesses[j];
                if (g == secret) {
                    // exact Match — payout = 2x stake. Break (no stacking multiple wins)
                    payout = (p.stake * EXACT_PAYOUT_BP) / 10000;
                    break;
                } else {
                    uint8 diff = g > secret ? g - secret : secret - g;
                    if (diff == 1) {
                        // 50% payout; but multiple guesses could match different distances.
                        // To prevent overpaying, keep the highest payout for this play.
                        uint256 candidate = (p.stake * DIST1_PAYOUT_BP) / 10000;
                        if (candidate > payout) payout = candidate;
                    } else if (diff == 2) {
                        uint256 candidate = (p.stake * DIST2_PAYOUT_BP) / 10000;
                        if (candidate > payout) payout = candidate;
                    }
                }
            }

            if (payout > 0) {
                // Ensure contract has balance (should, because stakes were transferred in)
                _transfer(address(this), p.player, payout);
            }
        }

        emit RoundFulfilled(roundKey, secret);
    }

    // ---------- Utility: admin can withdraw leftover tokens  ----------
    // Allows owner to withdraw tokens if needed (e.g., house cut or leftover).
    function adminWithdraw(uint256 amount, address to) external onlyOwner {
        _transfer(address(this), to, amount);
    }

    // ---------- Admin: set VRF parameters ----------
    function setCallbackGasLimit(uint32 _limit) external onlyOwner {
        callbackGasLimit = _limit;
    }
    function setSubscriptionId(uint64 subId) external onlyOwner {
        s_subscriptionId = subId;
    }

    // ---------- Token helper: buy BASE with native ETH (optional) ----------
    // Very simple buy: price 1 ETH => 1000 BASE (example). In production use swap or pricing oracle.
    function buyBase() external payable {
        require(msg.value > 0, "send ETH");
        uint256 baseAmount = msg.value * 1000; // naive
        _mint(msg.sender, baseAmount);
    }

    // fallback to receive ETH
    receive() external payable {}
}
