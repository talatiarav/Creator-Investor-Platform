// compiler.ts
// Compiles Solidity contracts at runtime using the bundled solc binary.
// Output is cached after first compilation — repeated deploys reuse it.
// In production: pre-compile and commit artifacts to the repo.

import fs from "fs";
import path from "path";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const solc = require("solc") as {
  compile: (input: string, options: { import: (path: string) => { contents?: string; error?: string } }) => string;
};

interface ContractArtifact {
  abi: unknown[];
  bytecode: string;
}

interface CompiledArtifacts {
  InvestmentBase: ContractArtifact;
  FixedReturnTimeLock: ContractArtifact;
}

let cachedArtifacts: CompiledArtifacts | null = null;

function findImports(importPath: string): { contents?: string; error?: string } {
  const localPath = path.join(__dirname, "..", "src", "contracts", importPath);
  if (fs.existsSync(localPath)) {
    return { contents: fs.readFileSync(localPath, "utf8") };
  }
  return { error: `File not found: ${importPath}` };
}

export function compileContracts(): CompiledArtifacts {
  if (cachedArtifacts) return cachedArtifacts;

  console.log("Compiling contracts...");

  const contractsDir = path.join(__dirname, "..", "src", "contracts");

  const sources = {
    "InvestmentBase.sol": {
      content: fs.readFileSync(path.join(contractsDir, "InvestmentBase.sol"), "utf8"),
    },
    "FixedReturnTimeLock.sol": {
      content: fs.readFileSync(path.join(contractsDir, "FixedReturnTimeLock.sol"), "utf8"),
    },
  };

  const input = {
    language: "Solidity",
    sources,
    settings: {
      outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
      optimizer: { enabled: true, runs: 200 },
    },
  };

  interface SolcOutput {
    errors?: Array<{ severity: string; formattedMessage: string; message: string }>;
    contracts?: Record<string, Record<string, {
      abi: unknown[];
      evm: { bytecode: { object: string } };
    }>>;
  }

  const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports })) as SolcOutput;

  if (output.errors) {
    const errors = output.errors.filter((e) => e.severity === "error");
    if (errors.length > 0) {
      throw new Error(`Compilation failed:\n${errors.map((e) => e.formattedMessage).join("\n")}`);
    }
    output.errors
      .filter((e) => e.severity === "warning")
      .forEach((w) => console.warn("Solidity warning:", w.message));
  }

  if (!output.contracts) throw new Error("No contracts in compilation output");

  cachedArtifacts = {
    InvestmentBase: {
      abi: output.contracts["InvestmentBase.sol"]["InvestmentBase"].abi,
      bytecode: "0x" + output.contracts["InvestmentBase.sol"]["InvestmentBase"].evm.bytecode.object,
    },
    FixedReturnTimeLock: {
      abi: output.contracts["FixedReturnTimeLock.sol"]["FixedReturnTimeLock"].abi,
      bytecode: "0x" + output.contracts["FixedReturnTimeLock.sol"]["FixedReturnTimeLock"].evm.bytecode.object,
    },
  };

  console.log("✅ Contracts compiled successfully");
  return cachedArtifacts;
}
