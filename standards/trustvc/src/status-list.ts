import { createRequire } from "node:module";
import type { CredentialStatusPurpose } from "@trustvc/w3c-credential-status";

const require = createRequire(import.meta.url);
const { StatusList } = require("@trustvc/w3c-credential-status") as typeof import("@trustvc/w3c-credential-status");

const STATUS_LIST_CONTEXT = "https://w3id.org/vc/status-list/2021/v1";
const STATUS_LIST_LENGTH = 131_072;

export interface BitstringStatusList {
  readonly credential: {
    readonly "@context": readonly string[];
    readonly id: string;
    readonly type: readonly string[];
    readonly issuer: string;
    readonly validFrom: string;
    readonly credentialSubject: {
      readonly id: string;
      readonly type: "BitstringStatusList";
      readonly statusPurpose: CredentialStatusPurpose;
      readonly encodedList: string;
    };
  };
  readonly isSet: (index: number) => boolean;
}

export interface CreateBitstringStatusListOptions {
  readonly id: string;
  readonly purpose: CredentialStatusPurpose;
  readonly revokedIndexes?: readonly number[];
  readonly issuer?: string;
}

export async function createBitstringStatusList(options: CreateBitstringStatusListOptions): Promise<BitstringStatusList> {
  const statusList = new StatusList({ length: STATUS_LIST_LENGTH });
  for (const index of options.revokedIndexes ?? []) {
    if (!Number.isSafeInteger(index) || index < 0 || index >= STATUS_LIST_LENGTH) throw new Error("Status-list index is outside the supported range");
    statusList.setStatus(index, true);
  }
  const encodedList = await statusList.encode();
  const credential = {
    "@context": ["https://www.w3.org/ns/credentials/v2", STATUS_LIST_CONTEXT],
    id: options.id,
    type: ["VerifiableCredential", "BitstringStatusListCredential"],
    issuer: options.issuer ?? "did:web:issuer.example.test",
    validFrom: "2026-01-01T00:00:00Z",
    credentialSubject: {
      id: `${options.id}#list`,
      type: "BitstringStatusList" as const,
      statusPurpose: options.purpose,
      encodedList,
    },
  };
  return {
    credential,
    isSet: (index) => statusList.getStatus(index),
  };
}

export function createStatusEntry(statusList: BitstringStatusList, index: number) {
  if (!Number.isSafeInteger(index) || index < 0 || !statusList.isSet(index)) throw new Error("Status entry must reference a set status-list bit");
  return {
    id: `${statusList.credential.id}#${index}`,
    type: "BitstringStatusListEntry" as const,
    statusPurpose: statusList.credential.credentialSubject.statusPurpose,
    statusListIndex: String(index),
    statusListCredential: statusList.credential.id,
  };
}

export { STATUS_LIST_CONTEXT, STATUS_LIST_LENGTH };
