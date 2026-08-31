import { readFile } from "node:fs/promises";
import { stdin, stdout } from "node:process";

import {
  createCodingHarnessExecutionReceipt,
  type CodingHarnessExecutionInput,
} from "../../server/coding-harness/index.ts";

const readStdin = async () => {
  const chunks: Buffer[] = [];
  for await (const chunk of stdin) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
};

const source = process.argv[2] ? await readFile(process.argv[2], "utf8") : await readStdin();
if (!source.trim()) throw new Error("Expected CodingHarness execution input as JSON on stdin or as a file argument.");

const input = JSON.parse(source) as CodingHarnessExecutionInput;
const receipt = await createCodingHarnessExecutionReceipt(input);
stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
