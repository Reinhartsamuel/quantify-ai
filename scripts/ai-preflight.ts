import { preflightAi } from "@quantify/ai";
import { loadConfig } from "@quantify/config";

const env = loadConfig();
const report = await preflightAi(env, { probe: process.argv.includes("--probe") });
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exit(1);
