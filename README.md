# Creator Investor Platform

**Full-stack platform connecting investors with content creators via brand-fit matching, executing investment agreements as audited smart contracts on Polygon.**

---

## The problem

The influencer economy has a capital access problem. Creators with proven audiences and strong brand identities often lack the upfront capital to grow — better equipment, team, production quality. Meanwhile, investors have no structured, low-friction way to invest in individual creators and enforce repayment terms. Traditional financial instruments don't fit well: creators aren't businesses with balance sheets, and informal handshake deals have no enforcement mechanism.

InfluenceVest solves both sides: it gives creators a structured way to raise capital from investors who match their brand identity, and it gives investors enforceable, transparent repayment terms backed by on-chain escrow rather than trust.

---

## Architecture

Three decoupled TypeScript microservices with distinct responsibilities, coordinated through a shared type system and a React frontend.

```
┌─────────────────────────────────────────────────────────────────┐
│                        React Frontend                           │
│          Brand profile setup · Creator browse · Deal flow       │
└───────────────┬─────────────────────┬───────────────────────────┘
                │                     │
                ▼                     ▼
┌──────────────────────┐   ┌──────────────────────┐
│    OAuth Service     │   │  Contract Facilitator │
│      port 3000       │   │      port 4000        │
│                      │   │                       │
│  Meta OAuth 2.0 flow │   │  Deploys Solidity     │
│  Token encryption    │   │  contracts to Polygon │
│  24h refresh job     │   │  Polls deal state     │
│                      │   │  Email notifications  │
└──────────┬───────────┘   └──────────┬────────────┘
           │                          │
           ▼                          ▼
┌──────────────────────┐   ┌──────────────────────┐
│   Brand Pipeline     │   │  Polygon Amoy         │
│                      │   │  (testnet)            │
│  Instagram Graph API │   │                       │
│  Claude vision API   │   │  InvestmentBase.sol   │
│  Brand classification│   │  FixedReturnTimeLock  │
│  Fit scoring 0–100   │   │  .sol                 │
└──────────────────────┘   └──────────────────────┘
```

### OAuth Service

Handles Instagram Business account authentication via Meta's OAuth 2.0 flow. When a creator signs up, they connect their Instagram account. The service exchanges authorization codes for long-lived access tokens, stores them AES-256 encrypted, and runs a 24-hour refresh scheduler to keep tokens alive without requiring creators to re-authenticate.

### Brand Pipeline

The matching engine. Pulls the creator's last 12 image posts from the Instagram Graph API and runs each through Claude's vision model with a structured prompt against a fixed 15-category taxonomy covering content category, aesthetic style, audience type, tone, and production quality. Individual post analyses are aggregated via weighted frequency counting — weighted by per-image confidence scores — into a single brand profile. A 0–100 fit score compares business owner attributes against each creator's derived profile, adjusted by the creator's engagement rate.

### Contract Facilitator

The transaction layer. When both parties agree on terms, the facilitator deploys a `FixedReturnTimeLock` contract to Polygon using the platform's backend wallet. The contract holds investor USDC in escrow, releases to the creator on acceptance, and enforces repayment. The facilitator polls active contracts every two minutes for state changes and fires typed email notifications on each transition. The blockchain is the source of truth; the platform's database mirrors its state.

---

## Smart contract design

Two Solidity contracts compiled at runtime via the bundled `solc` binary.

`InvestmentBase` is an abstract contract implementing the shared lifecycle:

- `fund()` — investor deposits USDC; requires prior `approve()` call on the USDC token contract
- `accept()` — creator accepts terms before the acceptance deadline, activating the deal
- `reclaim()` — investor retrieves funds if the creator never accepts past the deadline

`FixedReturnTimeLock` inherits from the base and adds repayment logic:

- `repay(uint256 amount)` — creator repays in one or more installments
- `withdraw()` — investor withdraws once full repayment has landed
- `isOverdue()` — view function returning whether the lock period has passed without full repayment
- `amountOwed()` — remaining balance the creator still owes

USDC transfers use `transferFrom` rather than native ETH, which means investors must `approve()` the contract before funding — a two-step wallet interaction the frontend stepper makes explicit.

**Contract status flow:**

```
Draft → Funded → Active → Complete
                        ↘ Refunded   (investor reclaims after deadline)
```

---

## Key technical decisions

### Backend-deployed contracts over wallet signing

The platform's wallet signs deployment transactions rather than requiring investors to have MetaMask. This eliminates a significant onboarding barrier for non-crypto-native investors, at the cost of the platform holding a deployer private key and paying gas. The blast radius is limited by keeping only MATIC for gas in the deployer wallet — investor USDC never routes through it.

### Fixed taxonomy over free-text classification

Brand classification uses a predefined set of 15 categories and 10 aesthetic types rather than free-form LLM output. This makes scores comparable across creators and filterable by business owners. Free-text generation would produce richer descriptions but unmatchable outputs — you cannot reliably query "find me all influencers with a warm minimalist aesthetic with sustainability undertones."

### Polling over event listeners for state tracking

The facilitator polls contracts every two minutes rather than using WebSocket subscriptions or webhook infrastructure. On a testnet with low deal volume this is acceptable. At scale this would be replaced with Alchemy Webhooks for instant event-driven notifications, removing the polling latency and RPC load entirely.

### Shared `types.ts` across services

All interfaces — `DealRecord`, `InfluencerRecord`, `PostAnalysis`, notification payloads — are defined once and imported by all three services and the frontend. In a monorepo this would be a published internal package. The compiler caught a real bug during the TypeScript migration: `DealRecord` was missing its `id` field, meaning notification URLs would have silently generated `/deals/undefined/fund` in the JavaScript version.

### Text-only brand analysis (v1)

The classification pipeline analyzes image posts only, not video. Reels carry significant brand signal — speaking tone, edit pace, content structure — but video analysis requires frame extraction and a vision or multimodal model run per frame, multiplying inference cost significantly. The v1 decision was to ship image-only analysis at lower cost and latency, with a Python FastAPI microservice (CLIP frame sampling + Whisper audio transcription) scoped as the next capability extension.

---

## What would be different at scale

**Data layer.** In-memory `Map` stores in `tokenStore.ts` and `facilitator.ts` lose all data on server restart. The function signatures are already designed so replacing the `Map` with PostgreSQL calls requires no changes to callers — the swap is localized to each store module.

**State tracking.** Polling every two minutes works at low volume. At scale, Alchemy Webhooks fire instantly when a transaction lands, eliminating polling latency and reducing RPC load to near zero for idle contracts.

**Classification.** Claude vision at $0.01–0.015 per image costs roughly $0.15 per creator profile build. At tens of thousands of weekly profile refreshes, training a fine-tuned CLIP classifier on accumulated labeled data becomes the economical path — lower cost per inference, faster, and tuned specifically to the platform's taxonomy rather than general image understanding.

**Video analysis.** A Python FastAPI microservice accepting a video URL and returning a brand classification in the same JSON schema as `analyzePost()` would extend the pipeline to Reels without changing any downstream consumers — same output contract, different analysis path routed by media type.

**Smart contract audit.** The contracts are not audited and should not hold real money without a professional audit from a firm such as Trail of Bits, OpenZeppelin, or Certik. Immutability means bugs are permanent after deployment — audit cost is non-negotiable at production scale.

**Meta App Review.** The OAuth integration is in development mode, accessible only to accounts manually added as testers in the Meta developer dashboard. Public access requires Meta App Review, a 4–6 week process.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript 5, ethers.js 6 |
| OAuth service | Node.js, Express, TypeScript, crypto-js |
| Brand pipeline | Node.js, TypeScript, Claude API (vision) |
| Contract facilitator | Node.js, Express, TypeScript, ethers.js |
| Smart contracts | Solidity 0.8.24, solc (bundled) |
| Blockchain | Polygon Amoy testnet → Polygon mainnet |
| Stablecoin | USDC (ERC-20, Circle) |
| Instagram data | Instagram Graph API, Meta OAuth 2.0 |
| Email | nodemailer (Ethereal in dev, SMTP in prod) |
| Containerisation | Docker Compose |

---

## Project structure

```
influencevest/
├── oauth-flow/
│   ├── src/
│   │   ├── types.ts          # Shared type definitions
│   │   ├── tokenStore.ts     # Encrypted token storage
│   │   ├── oauthHandler.ts   # Four-step OAuth flow
│   │   └── server.ts         # Express routes
│   └── tsconfig.json
│
├── brand-pipeline/
│   ├── src/
│   │   ├── types.ts          # Shared type definitions
│   │   ├── instagramClient.ts # Graph API calls
│   │   ├── brandAnalyzer.ts  # Vision classification + scoring
│   │   └── pipeline.ts       # Orchestrator
│   └── tsconfig.json
│
├── contract-facilitator/
│   ├── src/
│   │   ├── types.ts          # Shared type definitions
│   │   ├── contracts/
│   │   │   ├── InvestmentBase.sol
│   │   │   └── FixedReturnTimeLock.sol
│   │   ├── compiler.ts       # Runtime Solidity compilation
│   │   ├── chain.ts          # ethers.js provider + wallet
│   │   ├── notifications.ts  # Typed email templates
│   │   ├── facilitator.ts    # Deploy, poll, notify
│   │   └── server.ts         # REST API
│   └── tsconfig.json
│
├── frontend/
│   └── src/
│       └── App.tsx           # React SPA — profile, browse, deal flow
│
└── docker-compose.yml
```

---

## Local setup

**Prerequisites:** Node.js 18+, Docker, a Meta developer account, an Alchemy account (Polygon Amoy), an Anthropic API key, and a fresh Ethereum wallet funded with test MATIC.

```bash
# Clone and install dependencies
git clone <repo>

cd oauth-flow && npm install
cd ../brand-pipeline && npm install
cd ../contract-facilitator && npm install
cd ../frontend && npm install

# Configure environment variables
cp oauth-flow/.env.example oauth-flow/.env
cp brand-pipeline/.env.example brand-pipeline/.env
cp contract-facilitator/.env.example contract-facilitator/.env
# Fill in each .env file — see comments in each file for where to get each value

# Type-check all services
cd oauth-flow && npx tsc --noEmit
cd ../brand-pipeline && npx tsc --noEmit
cd ../contract-facilitator && npx tsc --noEmit

# Run all services via Docker Compose
docker-compose up

# Or run individually in development mode
cd oauth-flow && npx ts-node src/server.ts          # port 3000
cd brand-pipeline && npx ts-node src/pipeline.ts    # runs once with INSTAGRAM_ACCESS_TOKEN
cd contract-facilitator && npx ts-node src/server.ts # port 4000
```

**Testing the contract facilitator:**

```bash
curl -X POST http://localhost:4000/deals \
  -H "Content-Type: application/json" \
  -d '{
    "dealId": "deal_001",
    "investorAddress": "0xYourInvestorAddress",
    "investeeAddress": "0xYourCreatorAddress",
    "principalUSDC": 1000,
    "returnAmountUSDC": 1100,
    "lockDays": 90,
    "acceptanceDays": 7,
    "investorEmail": "investor@example.com",
    "influencerEmail": "creator@example.com",
    "influencerUsername": "testcreator",
    "investorName": "Test Investor"
  }'
```

The response includes the deployed contract address and a Polygonscan explorer link.

---

## Generating a deployer wallet

```bash
node -e "const {ethers} = require('ethers'); const w = ethers.Wallet.createRandom(); console.log('Address:', w.address); console.log('Private key:', w.privateKey)"
```

Fund the address with test MATIC from [faucet.polygon.technology](https://faucet.polygon.technology) (select Amoy network). Fund a second wallet with test USDC from [faucet.circle.com](https://faucet.circle.com).

The deployer wallet signs contract deployments and pays gas only. It never holds investor USDC.
