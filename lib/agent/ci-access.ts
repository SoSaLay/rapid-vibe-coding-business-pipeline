/**
 * CI access slot: give GitHub's workflow its own way to deploy an agent to its host, so automatic
 * releases work for anyone who uses the pipeline, with nothing hand-set per account.
 *
 *  - agentcore (AWS): keyless. Using the AWS sign-in already on this machine (onboarding), make AWS
 *    trust GitHub's sign-in (OIDC, once per account) and create a deploy role per agent that only that
 *    agent's repo can use, allowed only to deploy AgentCore agents. GitHub gets the role's ARN as a repo
 *    variable — no key is stored anywhere. If the sign-in can't create roles, pasted access keys are the
 *    fallback (sent as repo secrets).
 *  - railway: the Railway token is enough (sent as a secret by the push).
 *
 * New hosts add an entry here; nothing else changes.
 */

import { awsEnv } from "./aws";
import { sh } from "./proc";
import type { HostId } from "./deploy";

export interface CiAccessResult {
  /** Repo variables to set (not secret). */
  vars: Record<string, string>;
  /** Repo secrets to set. */
  secrets: Record<string, string>;
  /** Plain note for the owner when something couldn't be set up. */
  note?: string;
}

export interface CiAccessAdapter {
  host: HostId;
  /** `subjects`: the repo's GitHub identity prefixes (classic "repo:owner/name" and, when GitHub uses it, the immutable-ID form). */
  ensure(args: { owner: string; repo: string; slug: string; subjects: string[] }): Promise<CiAccessResult>;
}

const GITHUB_OIDC = "token.actions.githubusercontent.com";

async function aws(args: string[], env: Record<string, string>) {
  const r = await sh("aws", [...args, "--output", "json"], { cwd: process.cwd(), env, timeoutMs: 60_000 });
  let json: any = null;
  try {
    json = JSON.parse(r.out);
  } catch {
    /* not JSON (or empty) */
  }
  return { ok: r.ok, out: r.out, json };
}

const agentcoreCi: CiAccessAdapter = {
  host: "agentcore",
  async ensure({ slug, subjects }) {
    const env = await awsEnv();
    if (!env) return { vars: {}, secrets: {}, note: "Connect AWS in onboarding so GitHub can release to it." };
    const region = env.AWS_REGION || "us-east-1";
    // Pasted keys: GitHub can use those directly (the fallback path).
    const keys: Record<string, string> = env.AWS_ACCESS_KEY_ID ? { AWS_ACCESS_KEY_ID: env.AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY: env.AWS_SECRET_ACCESS_KEY } : {};

    const who = await aws(["sts", "get-caller-identity"], env);
    const account: string | undefined = who.json?.Account;
    if (!account) return { vars: { AWS_REGION: region }, secrets: keys, note: "This machine's AWS sign-in isn't working, so GitHub can't be given AWS access." };

    // 1. AWS trusts GitHub's sign-in (once per account).
    const providerArn = `arn:aws:iam::${account}:oidc-provider/${GITHUB_OIDC}`;
    const providers = await aws(["iam", "list-open-id-connect-providers"], env);
    const has = (providers.json?.OpenIDConnectProviderList ?? []).some((p: any) => p.Arn === providerArn);
    if (!has) {
      const made = await aws(
        [
          "iam", "create-open-id-connect-provider",
          "--url", `https://${GITHUB_OIDC}`,
          "--client-id-list", "sts.amazonaws.com",
          "--thumbprint-list", "6938fd4d98bab03faadb97b34396831e3780aea1", "1c58a3a8518e8759bf075b76b750d4f2df264fcd",
        ],
        env,
      );
      if (!made.ok && !/EntityAlreadyExists/.test(made.out)) return fallback(region, keys, made.out);
    }

    // 2. A deploy role only this agent's repo can use.
    const roleName = `rvc-deploy-${slug}`.slice(0, 64);
    const trust = JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Principal: { Federated: providerArn },
          Action: "sts:AssumeRoleWithWebIdentity",
          Condition: {
            StringEquals: { [`${GITHUB_OIDC}:aud`]: "sts.amazonaws.com" },
            StringLike: { [`${GITHUB_OIDC}:sub`]: subjects.map((p) => `${p}:*`) },
          },
        },
      ],
    });
    const existing = await aws(["iam", "get-role", "--role-name", roleName], env);
    const role = existing.ok
      ? await aws(["iam", "update-assume-role-policy", "--role-name", roleName, "--policy-document", trust], env)
      : await aws(["iam", "create-role", "--role-name", roleName, "--assume-role-policy-document", trust, "--description", `GitHub Actions deploys of agent ${slug} (rapid-vibe-coding pipeline)`], env);
    if (!role.ok) return fallback(region, keys, role.out);

    // Only what an AgentCore deploy needs: the AgentCore API, its own S3 / ECR / CodeBuild resources,
    // logs, and passing the agent's existing runtime role.
    const policy = JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        { Effect: "Allow", Action: ["bedrock-agentcore:*", "bedrock-agentcore-control:*"], Resource: "*" },
        { Effect: "Allow", Action: ["sts:GetCallerIdentity"], Resource: "*" },
        { Effect: "Allow", Action: ["iam:GetRole", "iam:PassRole", "iam:ListAttachedRolePolicies", "iam:GetRolePolicy"], Resource: `arn:aws:iam::${account}:role/AmazonBedrockAgentCoreSDK*` },
        { Effect: "Allow", Action: ["s3:*"], Resource: [`arn:aws:s3:::bedrock-agentcore-*`, `arn:aws:s3:::bedrock-agentcore-*/*`] },
        { Effect: "Allow", Action: ["ecr:*"], Resource: `arn:aws:ecr:${region}:${account}:repository/bedrock-agentcore-*` },
        { Effect: "Allow", Action: ["ecr:GetAuthorizationToken"], Resource: "*" },
        { Effect: "Allow", Action: ["codebuild:*"], Resource: `arn:aws:codebuild:${region}:${account}:project/bedrock-agentcore-*` },
        { Effect: "Allow", Action: ["logs:*"], Resource: `arn:aws:logs:${region}:${account}:log-group:/aws/bedrock-agentcore/*` },
      ],
    });
    const put = await aws(["iam", "put-role-policy", "--role-name", roleName, "--policy-name", "agentcore-deploy", "--policy-document", policy], env);
    if (!put.ok) return fallback(region, keys, put.out);

    return { vars: { AWS_ROLE_ARN: `arn:aws:iam::${account}:role/${roleName}`, AWS_REGION: region }, secrets: {} };
  },
};

function fallback(region: string, keys: Record<string, string>, why: string): CiAccessResult {
  return Object.keys(keys).length
    ? { vars: { AWS_REGION: region }, secrets: keys }
    : {
        vars: { AWS_REGION: region },
        secrets: {},
        note: `Couldn't give GitHub AWS access (${why.trim().split("\n").pop()?.slice(0, 160)}). Your AWS sign-in needs permission to create IAM roles, or paste AWS access keys in onboarding.`,
      };
}

const railwayCi: CiAccessAdapter = {
  host: "railway",
  async ensure() {
    return { vars: {}, secrets: {} }; // the Railway token goes up with the push's secrets
  },
};

const ADAPTERS: Record<HostId, CiAccessAdapter> = { agentcore: agentcoreCi, railway: railwayCi };

export function ciAccess(host: HostId): CiAccessAdapter {
  return ADAPTERS[host];
}
