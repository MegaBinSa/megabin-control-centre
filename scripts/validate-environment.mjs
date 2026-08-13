import { configurationReport, validateEnvironment } from "./environment-contract.mjs";

const target = process.argv[2];
const deployment = process.argv.includes("--deployment");
const result = validateEnvironment(target, process.env, { deployment });
for (const item of configurationReport(target, process.env, { deployment }))
  console.log(`${item.key}: ${item.status} (${item.classification})`);
if (!result.ok) {
  for (const error of result.errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}
console.log(`${target} environment contract is valid; no values were printed.`);
