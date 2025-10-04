import gameArtifact from "../contracts/out/BaseNumberSniper.sol/BaseBidGame.json";

// Deployed contract address
export const gameAddress = "0x6004071e5a15dDDAF40eE3321b9C552800326C30";

// ABI
export const gameABI = gameArtifact.abi;

// Pack costs as strings (Ethers-compatible)
export const PACK_COSTS: Record<3 | 5 | 8, string> = {
  3: (15n * 10n ** 18n).toString(),
  5: (10n * 10n ** 18n).toString(),
  8: (3n * 10n ** 18n).toString(),
};
