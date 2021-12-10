import { keccak256 } from "ethers/lib/utils";
export const DEFAULT_ADMIN_ROLE =
  "0x0000000000000000000000000000000000000000000000000000000000000000";
export const GOVERNANCE_ROLE = keccak256(
  Buffer.from("GOVERNANCE_ROLE", "utf-8")
);
export const PANIC_ROLE = keccak256(Buffer.from("PANIC_ROLE", "utf-8"));
export const GUARDIAN_ROLE = keccak256(Buffer.from("GUARDIAN_ROLE", "utf-8"));
export const DEPLOYER_ROLE = keccak256(Buffer.from("DEPLOYER_ROLE", "utf-8"));
export const CREATOR_ROLE = keccak256(Buffer.from("CREATOR_ROLE", "utf-8"));
export const STRATEGIST_ROLE = keccak256(
  Buffer.from("STRATEGIST_ROLE", "utf-8")
);
export const VAULT_ROLE = keccak256(Buffer.from("VAULT_ROLE", "utf-8"));
export const ROLLOVER_ROLE = keccak256(Buffer.from("ROLLOVER_ROLE", "utf-8"));
export const STRATEGY_ROLE = keccak256(Buffer.from("STRATEGY_ROLE", "utf-8"));
export const MANAGER_ROLE = keccak256(Buffer.from("MANAGER_ROLE", "utf-8"));
