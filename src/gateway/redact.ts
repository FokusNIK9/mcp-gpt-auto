/**
 * Redaction utility to prevent leaking secrets in logs and reports.
 */

const SECRET_PATTERNS = [
  // GitHub classic PAT
  /ghp_[A-Za-z0-9_]{10,}/g,
  // GitHub fine-grained PAT
  /github_pat_[A-Za-z0-9_]+/g,
  // GitLab token
  /glpat-[A-Za-z0-9_-]{20,}/g,
  // OpenAI-style key
  /sk-[A-Za-z0-9_-]{20,}/g,
  // Generic env secret assignment (e.g. GITHUB_TOKEN=...)
  /(GITHUB_TOKEN|TOKEN|API_KEY|APIKEY|SECRET|PASSWORD)\s*=\s*[^\s"']+/gi,
  // Private key blocks
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g
];

/**
 * Redacts secrets from a string.
 */
export function redactText(text: string): string {
  if (!text || typeof text !== "string") return text;
  
  let redacted = text;
  
  // Apply specific patterns
  for (const pattern of SECRET_PATTERNS) {
    // For env assignments, we want to keep the variable name but redact the value
    if (pattern.source.includes("GITHUB_TOKEN|TOKEN|API_KEY")) {
        redacted = redacted.replace(pattern, (match) => {
            const parts = match.split("=");
            return `${parts[0]}=[REDACTED]`;
        });
    } else {
        redacted = redacted.replace(pattern, "[REDACTED]");
    }
  }
  
  return redacted;
}

/**
 * Recursively redacts secrets from any value (object, array, string).
 */
export function redactSecrets(value: unknown): unknown {
  if (typeof value === "string") {
    return redactText(value);
  }
  
  if (Array.isArray(value)) {
    return value.map(item => redactSecrets(item));
  }
  
  if (value !== null && typeof value === "object") {
    const redactedObj: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      // Also redact values if the key looks like it contains a secret
      const isSecretKey = /token|key|secret|password|auth/i.test(key);
      if (isSecretKey && typeof val === "string") {
        redactedObj[key] = "[REDACTED]";
      } else {
        redactedObj[key] = redactSecrets(val);
      }
    }
    return redactedObj;
  }
  
  return value;
}
