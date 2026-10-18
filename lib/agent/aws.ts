/**
 * AWS sign-in for deploys. Default: use this computer's existing AWS CLI sign-in (a named profile in ~/.aws),
 * so nobody copies keys. Pasted access keys remain a fallback.
 */

import os from "os";
import { readConnectorConfig } from "../connectors/config";
import { lastJson, sh } from "./proc";

const AWS_BIN = process.env.AWS_BIN || "aws";

export async function awsIdentity(profile: string): Promise<{ ok: boolean; account?: string; arn?: string; error?: string }> {
  const r = await sh(AWS_BIN, ["sts", "get-caller-identity", "--profile", profile, "--output", "json"], { cwd: os.homedir(), timeoutMs: 20_000 });
  const j = lastJson<{ Account: string; Arn: string }>(r.out) ?? (() => {
    try {
      return JSON.parse(r.out);
    } catch {
      return null;
    }
  })();
  return r.ok && j?.Account ? { ok: true, account: j.Account, arn: j.Arn } : { ok: false, error: r.out.trim().slice(-300) || "AWS CLI not signed in." };
}

export async function awsProfiles(): Promise<string[]> {
  const r = await sh(AWS_BIN, ["configure", "list-profiles"], { cwd: os.homedir(), timeoutMs: 10_000 });
  return r.ok ? r.out.split("\n").map((x) => x.trim()).filter(Boolean) : [];
}

export async function awsDefaultRegion(profile: string): Promise<string> {
  const r = await sh(AWS_BIN, ["configure", "get", "region", "--profile", profile], { cwd: os.homedir(), timeoutMs: 10_000 });
  return r.out.trim() || "us-east-1";
}

/** Env for deploy subprocesses: the profile (no keys copied), or pasted keys. Null if AWS isn't connected. */
export async function awsEnv(): Promise<Record<string, string> | null> {
  const c = await readConnectorConfig("aws");
  if (!c) return null;
  const region = c.region || "us-east-1";
  if (c.profile) return { AWS_PROFILE: c.profile, AWS_REGION: region, AWS_DEFAULT_REGION: region };
  if (c.accessKeyId && c.secretAccessKey) return { AWS_ACCESS_KEY_ID: c.accessKeyId, AWS_SECRET_ACCESS_KEY: c.secretAccessKey, AWS_REGION: region, AWS_DEFAULT_REGION: region };
  return null;
}
