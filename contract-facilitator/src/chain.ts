// chain.ts
// ethers.js provider, deployer wallet, and USDC utilities for Polygon Amoy testnet.
//
// Testnet:  https://rpc-amoy.polygon.technology / https://amoy.polygonscan.com
// Faucets:  https://faucet.polygon.technology (MATIC) / https://faucet.circle.com (USDC)
// Mainnet USDC on Polygon: 0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359

import { ethers } from "ethers";

export const USDC_ADDRESS_AMOY = "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582";

let _provider: ethers.JsonRpcProvider | null = null;
let _wallet: ethers.Wallet | null = null;

export function getProvider(): ethers.JsonRpcProvider {
  if (_provider) return _provider;
  const rpcUrl = process.env.RPC_URL ?? "https://rpc-amoy.polygon.technology";
  _provider = new ethers.JsonRpcProvider(rpcUrl);
  return _provider;
}

export function getDeployerWallet(): ethers.Wallet {
  if (_wallet) return _wallet;

  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error(
      "DEPLOYER_PRIVATE_KEY is required.\n" +
      "Generate: node -e \"const {ethers}=require('ethers'); console.log(ethers.Wallet.createRandom().privateKey)\"\n" +
      "Fund with test MATIC: https://faucet.polygon.technology"
    );
  }

  _wallet = new ethers.Wallet(privateKey, getProvider());
  return _wallet;
}

// Convert whole-dollar USDC to 6-decimal units (e.g. 1000 → 1000000000n)
export function formatUSDC(amount: number): bigint {
  return ethers.parseUnits(amount.toString(), 6);
}

// Convert 6-decimal units back to dollar string (e.g. 1000000000n → "1000.0")
export function parseUSDC(rawAmount: bigint): string {
  return ethers.formatUnits(rawAmount, 6);
}
