import { hexToU8a, stringToU8a } from "@polkadot/util";
import { z } from "zod";
import type { SubstrateClient } from "../chain/substrate-client.js";
import { logger } from "../logger.js";

export interface RbacClientConfig {
  substrate: SubstrateClient;
}

export interface RbacReceipt {
  txHash: string;
  blockHash: string;
  blockNumber: number;
  durationMs: number;
}

const idSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]+$/, "ID must be 0x-prefixed hex (typically 32 bytes)");
const nameSchema = z.string().min(1).max(64);

export class PeaqRbacClient {
  constructor(private readonly cfg: RbacClientConfig) {}

  async addRole(roleId: string, name: string): Promise<RbacReceipt> {
    return this.submit("peaqRbac", "addRole", [
      hexToU8a(idSchema.parse(roleId)),
      stringToU8a(nameSchema.parse(name)),
    ]);
  }

  async assignRoleToUser(roleId: string, userId: string): Promise<RbacReceipt> {
    return this.submit("peaqRbac", "assignRoleToUser", [
      hexToU8a(idSchema.parse(roleId)),
      hexToU8a(idSchema.parse(userId)),
    ]);
  }

  async addGroup(groupId: string, name: string): Promise<RbacReceipt> {
    return this.submit("peaqRbac", "addGroup", [
      hexToU8a(idSchema.parse(groupId)),
      stringToU8a(nameSchema.parse(name)),
    ]);
  }

  async assignRoleToGroup(roleId: string, groupId: string): Promise<RbacReceipt> {
    return this.submit("peaqRbac", "assignRoleToGroup", [
      hexToU8a(idSchema.parse(roleId)),
      hexToU8a(idSchema.parse(groupId)),
    ]);
  }

  async addPermission(permissionId: string, name: string): Promise<RbacReceipt> {
    return this.submit("peaqRbac", "addPermission", [
      hexToU8a(idSchema.parse(permissionId)),
      stringToU8a(nameSchema.parse(name)),
    ]);
  }

  async assignPermissionToRole(permissionId: string, roleId: string): Promise<RbacReceipt> {
    return this.submit("peaqRbac", "assignPermissionToRole", [
      hexToU8a(idSchema.parse(permissionId)),
      hexToU8a(idSchema.parse(roleId)),
    ]);
  }

  private async submit(palletName: string, method: string, args: unknown[]): Promise<RbacReceipt> {
    const api = this.cfg.substrate.getApi();
    const pallet = api.tx[palletName];
    if (!pallet || !pallet[method]) {
      throw new Error(`${palletName}.${method} extrinsic not found on connected node`);
    }
    const tx = pallet[method]!(...(args as never[]));
    logger.info(
      { event: "peaq.rbac.submitting", palletName, method },
      `Submitting ${palletName}.${method}`,
    );
    const receipt = await this.cfg.substrate.submitExtrinsic(tx);
    return {
      txHash: receipt.txHash,
      blockHash: receipt.blockHash,
      blockNumber: receipt.blockNumber,
      durationMs: receipt.durationMs,
    };
  }
}
