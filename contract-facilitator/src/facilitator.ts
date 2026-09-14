// facilitator.ts
// Core service bridging the matching platform and the blockchain.
// Deploys contracts, tracks deal state, polls for on-chain changes,
// and fires typed email notifications on transitions.

import { ethers, type InterfaceAbi } from "ethers";
import { compileContracts } from "./compiler";
import { getProvider, getDeployerWallet, formatUSDC, parseUSDC, USDC_ADDRESS_AMOY } from "./chain";
import * as notifications from "./notifications";
import {
  DealRecord, DeployDealParams, OnChainDealState,
  DealPlatformStatus, OnChainStatus,
} from "./types";

// In-memory store — replace with PostgreSQL in production
const deals = new Map<string, DealRecord>();

const STATUS_NAMES: OnChainStatus[] = ["Draft", "Funded", "Active", "Refunded", "Complete"];

// ── Deploy ────────────────────────────────────────────────────────────────────
export async function deployDeal(params: DeployDealParams): Promise<DealRecord> {
  const {
    dealId, investorAddress, investeeAddress,
    principalUSDC, returnAmountUSDC,
    lockDays, acceptanceDays = 7,
    investorEmail, influencerUsername,
  } = params;

  if (deals.has(dealId)) throw new Error(`Deal ${dealId} already exists`);
  if (!ethers.isAddress(investorAddress) || !ethers.isAddress(investeeAddress)) {
    throw new Error("Invalid Ethereum address for investor or investee");
  }

  const principalRaw = formatUSDC(principalUSDC);
  const returnAmountRaw = formatUSDC(returnAmountUSDC);
  const lockDurationSeconds = lockDays * 24 * 60 * 60;
  const acceptanceWindowSeconds = acceptanceDays * 24 * 60 * 60;

  console.log(`Deploying contract for deal ${dealId}...`);

  const artifacts = compileContracts();
  const wallet = getDeployerWallet();

  const factory = new ethers.ContractFactory(
    artifacts.FixedReturnTimeLock.abi as InterfaceAbi,
    artifacts.FixedReturnTimeLock.bytecode,
    wallet
  );

  const contract = await factory.deploy(
    USDC_ADDRESS_AMOY, investorAddress, investeeAddress,
    principalRaw, acceptanceWindowSeconds, returnAmountRaw, lockDurationSeconds
  );

  const deployTx = contract.deploymentTransaction();
  if (!deployTx) throw new Error("No deployment transaction found");

  console.log(`  Deployment tx: ${deployTx.hash}`);
  await contract.waitForDeployment();

  const contractAddress = await contract.getAddress();
  console.log(`✅ Contract deployed at: ${contractAddress}`);

  const now = new Date();
  const acceptanceDeadline = new Date(now.getTime() + acceptanceDays * 24 * 60 * 60 * 1000);
  const repaymentDeadline = new Date(now.getTime() + (acceptanceDays + lockDays) * 24 * 60 * 60 * 1000);

  const deal: DealRecord = {
    ...params,
    id: dealId,
    acceptanceDays,
    contractAddress,
    deployTxHash: deployTx.hash,
    acceptanceDeadline: acceptanceDeadline.toISOString(),
    repaymentDeadline: repaymentDeadline.toISOString(),
    platformStatus: "deployed",
    deployedAt: now.toISOString(),
    fundedAt: null,
    activatedAt: null,
    completedAt: null,
  };

  deals.set(dealId, deal);

  await notifications.notifyContractDeployed({ investorEmail, influencerUsername, deal });

  return deal;
}

// ── Poll a single deal ────────────────────────────────────────────────────────
async function checkDealState(deal: DealRecord): Promise<void> {
  const artifacts = compileContracts();
  const contract = new ethers.Contract(
    deal.contractAddress,
    artifacts.FixedReturnTimeLock.abi as InterfaceAbi,
    getProvider()
  );

  const [statusRaw, amountRepaid, isOverdue] = await Promise.all([
    contract["status"]() as Promise<bigint>,
    contract["amountRepaid"]() as Promise<bigint>,
    contract["isOverdue"]() as Promise<boolean>,
  ]);

  const onChainStatus = STATUS_NAMES[Number(statusRaw)];
  const repaidUSDC = parseFloat(parseUSDC(amountRepaid));

  const transitions: Array<{
    from: DealPlatformStatus;
    to: DealPlatformStatus;
    onChain: OnChainStatus;
    notify: () => Promise<void>;
  }> = [
    {
      from: "deployed", to: "funded", onChain: "Funded",
      notify: () => notifications.notifyContractFunded({
        influencerEmail: deal.influencerEmail, investorName: deal.investorName, deal,
      }),
    },
    {
      from: "funded", to: "active", onChain: "Active",
      notify: () => notifications.notifyDealActivated({
        investorEmail: deal.investorEmail, influencerUsername: deal.influencerUsername, deal,
      }),
    },
    {
      from: "active", to: "complete", onChain: "Complete",
      notify: () => notifications.notifyRepaymentComplete({
        investorEmail: deal.investorEmail, influencerUsername: deal.influencerUsername, deal,
      }),
    },
    {
      from: "funded", to: "refunded", onChain: "Refunded",
      notify: () => notifications.notifyDealExpired({
        investorEmail: deal.investorEmail, influencerUsername: deal.influencerUsername, deal,
      }),
    },
  ];

  for (const { from, to, onChain, notify } of transitions) {
    if (onChainStatus === onChain && deal.platformStatus === from) {
      deal.platformStatus = to;
      if (to === "complete") deal.repaidUSDC = repaidUSDC;
      const now = new Date().toISOString();
      if (to === "funded") deal.fundedAt = now;
      if (to === "active") deal.activatedAt = now;
      if (to === "complete") deal.completedAt = now;
      deals.set(deal.id, deal);
      await notify();
      return;
    }
  }

  // Overdue notification (not a status transition — deal stays Active)
  if (isOverdue && deal.platformStatus === "active" && !deal.overdueNotifiedAt) {
    deal.overdueNotifiedAt = new Date().toISOString();
    deals.set(deal.id, deal);
    await notifications.notifyDealOverdue({
      investorEmail: deal.investorEmail,
      influencerEmail: deal.influencerEmail,
      influencerUsername: deal.influencerUsername,
      deal,
    });
  }
}

// ── Poll all active deals ─────────────────────────────────────────────────────
export async function pollAllDeals(): Promise<void> {
  const activeStatuses: DealPlatformStatus[] = ["deployed", "funded", "active"];
  const activeDeals = [...deals.values()].filter((d) => activeStatuses.includes(d.platformStatus));

  if (activeDeals.length === 0) return;

  console.log(`Polling ${activeDeals.length} active deal(s)...`);

  for (const deal of activeDeals) {
    try {
      await checkDealState(deal);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error(`Failed to check deal ${deal.id}: ${msg}`);
    }
  }
}

export function startPolling(intervalMs = 2 * 60 * 1000): void {
  console.log(`Starting deal polling every ${intervalMs / 1000}s...`);
  setInterval(() => { void pollAllDeals(); }, intervalMs);
  void pollAllDeals();
}

// ── Read helpers ──────────────────────────────────────────────────────────────
export function getDeal(dealId: string): DealRecord | null {
  return deals.get(dealId) ?? null;
}

export function listDeals(filterStatus: DealPlatformStatus | null = null): DealRecord[] {
  const all = [...deals.values()];
  return filterStatus ? all.filter((d) => d.platformStatus === filterStatus) : all;
}

export async function getDealOnChainState(dealId: string): Promise<OnChainDealState> {
  const deal = deals.get(dealId);
  if (!deal) throw new Error(`Deal ${dealId} not found`);

  const artifacts = compileContracts();
  const contract = new ethers.Contract(
    deal.contractAddress,
    artifacts.FixedReturnTimeLock.abi as InterfaceAbi,
    getProvider()
  );

  const [statusRaw, amountRepaid, isOverdue, amountOwed] = await Promise.all([
    contract["status"]() as Promise<bigint>,
    contract["amountRepaid"]() as Promise<bigint>,
    contract["isOverdue"]() as Promise<boolean>,
    contract["amountOwed"]() as Promise<bigint>,
  ]);

  const amountRepaidUSDC = parseFloat(parseUSDC(amountRepaid));

  return {
    dealId,
    contractAddress: deal.contractAddress,
    onChainStatus: STATUS_NAMES[Number(statusRaw)],
    platformStatus: deal.platformStatus,
    principalUSDC: deal.principalUSDC,
    returnAmountUSDC: deal.returnAmountUSDC,
    amountRepaidUSDC,
    amountOwedUSDC: parseFloat(parseUSDC(amountOwed)),
    repaymentProgress: deal.returnAmountUSDC > 0
      ? Math.round((amountRepaidUSDC / deal.returnAmountUSDC) * 100) : 0,
    isOverdue,
    acceptanceDeadline: deal.acceptanceDeadline,
    repaymentDeadline: deal.repaymentDeadline,
    explorerUrl: `https://amoy.polygonscan.com/address/${deal.contractAddress}`,
  };
}
