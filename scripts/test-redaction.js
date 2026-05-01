import { redactText, redactSecrets } from "../dist/gateway/redact.js";

const testStrings = [
  "ghp_1234567890abcdefghijklmnopqrstuvwxyz",
  "github_pat_1234567890_ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  "glpat-1234567890abcdefghijklmnopqrstuvwxyz",
  "sk-1234567890abcdefghijklmnopqrstuvwxyz",
  "GITHUB_TOKEN=ghp_1234567890abcdefghijklmnopqrstuvwxyz",
  "API_KEY=sk-1234567890abcdefghijklmnopqrstuvwxyz",
  "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----",
  "Normal text with no secrets.",
  "Token in a sentence: My ghp_token_here is secret."
];

const testObject = {
  taskId: "test-task",
  token: "ghp_direct_leak",
  config: {
    apiKey: "sk-nested-leak",
    nested: [
      "github_pat_array_leak",
      { secret: "hidden" }
    ]
  },
  output: "Standard output with GITHUB_TOKEN=ghp_env_leak"
};

console.log("=== Redaction Test ===");

let failed = false;

for (const s of testStrings) {
  const redacted = redactText(s);
  console.log(`Original: ${s.replace(/\n/g, "\\n")}`);
  console.log(`Redacted: ${redacted.replace(/\n/g, "\\n")}`);
  
  if (redacted.includes("ghp_") || redacted.includes("github_pat_") || redacted.includes("sk-") || redacted.includes("glpat-") || redacted.includes("BEGIN PRIVATE KEY")) {
    console.error("FAIL: Secret leaked in redacted text!");
    failed = true;
  }
}

console.log("\n--- Object Redaction ---");
const redactedObj = redactSecrets(testObject);
const json = JSON.stringify(redactedObj, null, 2);
console.log(json);

if (json.includes("ghp_") || json.includes("github_pat_") || json.includes("sk-") || json.includes("glpat-") || json.includes("BEGIN PRIVATE KEY")) {
  console.error("FAIL: Secret leaked in redacted object!");
  failed = true;
}

if (failed) {
  console.error("\nTests FAILED!");
  process.exit(1);
} else {
  console.log("\nTests PASSED!");
}
