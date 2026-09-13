// notifications.ts
// Typed email notifications for each contract lifecycle event.

import nodemailer from "nodemailer";
import {
  NotifyContractDeployedParams, NotifyContractFundedParams,
  NotifyDealActivatedParams, NotifyDealExpiredParams,
  NotifyRepaymentCompleteParams, NotifyDealOverdueParams,
} from "./types";

interface MailTransport {
  sendMail: (options: {
    from: string; to: string; subject: string; text: string;
  }) => Promise<{ messageId: string }>;
}

function createTransport(): MailTransport {
  if (process.env.NODE_ENV === "production") {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT ?? "587", 10),
      secure: false,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }

  // Development: log to console instead of sending
  return {
    sendMail: async ({ to, subject, text }) => {
      console.log("\n📧 [EMAIL — dev mode]");
      console.log(`   To:      ${to}`);
      console.log(`   Subject: ${subject}`);
      console.log(`   Preview: ${text.slice(0, 120)}...`);
      return { messageId: `dev_${Date.now()}` };
    },
  };
}

const transporter = createTransport();
const FROM = process.env.FROM_EMAIL ?? "noreply@yourplatform.com";
const BASE = process.env.BASE_URL ?? "http://localhost:4000";

export async function notifyContractDeployed({
  investorEmail, influencerUsername, deal,
}: NotifyContractDeployedParams): Promise<void> {
  await transporter.sendMail({
    from: FROM, to: investorEmail,
    subject: `Your investment contract with @${influencerUsername} is ready to fund`,
    text: `Your contract has been deployed to the blockchain.

Investment: $${deal.principalUSDC} USDC
Return:     $${deal.returnAmountUSDC} USDC
Lock period: ${deal.lockDays} days
Contract:   ${deal.contractAddress}
Explorer:   https://amoy.polygonscan.com/address/${deal.contractAddress}

Fund it here: ${BASE}/deals/${deal.id}/fund

The influencer has ${deal.acceptanceDays} days to accept.
If they don't, your funds are automatically returned.`,
  });
}

export async function notifyContractFunded({
  influencerEmail, investorName, deal,
}: NotifyContractFundedParams): Promise<void> {
  await transporter.sendMail({
    from: FROM, to: influencerEmail,
    subject: `${investorName} funded your deal — action required`,
    text: `${investorName} deposited $${deal.principalUSDC} USDC into your contract.

You owe back:         $${deal.returnAmountUSDC} USDC after ${deal.lockDays} days
Acceptance deadline:  ${deal.acceptanceDeadline}

Accept here: ${BASE}/deals/${deal.id}/accept

If you don't accept by the deadline, funds automatically return to the investor.`,
  });
}

export async function notifyDealActivated({
  investorEmail, influencerUsername, deal,
}: NotifyDealActivatedParams): Promise<void> {
  await transporter.sendMail({
    from: FROM, to: investorEmail,
    subject: `@${influencerUsername} accepted your deal`,
    text: `@${influencerUsername} accepted and received your $${deal.principalUSDC} USDC.

Repayment due:    ${deal.repaymentDeadline}
Repayment amount: $${deal.returnAmountUSDC} USDC

Track this deal: ${BASE}/deals/${deal.id}`,
  });
}

export async function notifyDealExpired({
  investorEmail, influencerUsername, deal,
}: NotifyDealExpiredParams): Promise<void> {
  await transporter.sendMail({
    from: FROM, to: investorEmail,
    subject: `Deal with @${influencerUsername} expired — funds returned`,
    text: `@${influencerUsername} didn't accept within ${deal.acceptanceDays} days.

Your $${deal.principalUSDC} USDC has been automatically returned.
Browse other influencers: ${BASE}/discover`,
  });
}

export async function notifyRepaymentComplete({
  investorEmail, influencerUsername, deal,
}: NotifyRepaymentCompleteParams): Promise<void> {
  await transporter.sendMail({
    from: FROM, to: investorEmail,
    subject: `@${influencerUsername} fully repaid — withdraw your funds`,
    text: `@${influencerUsername} completed repayment of $${deal.returnAmountUSDC} USDC.

Withdraw here: ${BASE}/deals/${deal.id}/withdraw`,
  });
}

export async function notifyDealOverdue({
  investorEmail, influencerEmail, influencerUsername, deal,
}: NotifyDealOverdueParams): Promise<void> {
  await Promise.all([
    transporter.sendMail({
      from: FROM, to: investorEmail,
      subject: `Deal with @${influencerUsername} is overdue`,
      text: `@${influencerUsername} has not repaid $${deal.returnAmountUSDC} USDC.
Due date was: ${deal.repaymentDeadline}
Contract: https://amoy.polygonscan.com/address/${deal.contractAddress}`,
    }),
    transporter.sendMail({
      from: FROM, to: influencerEmail,
      subject: `Your repayment to ${deal.investorName} is overdue`,
      text: `You owe $${deal.returnAmountUSDC} USDC to ${deal.investorName}.
Deadline: ${deal.repaymentDeadline}
Repay here: ${BASE}/deals/${deal.id}/repay`,
    }),
  ]);
}
