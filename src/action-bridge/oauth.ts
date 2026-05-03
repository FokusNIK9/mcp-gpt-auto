/**
 * OAuth2 support for the Action Bridge.
 * Provides token-based OAuth flow alongside the existing API key auth.
 *
 * Supports:
 * - Client Credentials flow (for machine-to-machine)
 * - Simple token-based flow (for Custom GPT Actions)
 *
 * Configuration via environment variables:
 *   OAUTH_ENABLED=true
 *   OAUTH_CLIENT_ID=your-client-id
 *   OAUTH_CLIENT_SECRET=your-client-secret
 *   OAUTH_TOKEN_EXPIRY_SECONDS=3600
 */

import crypto from "node:crypto";
import express from "express";

interface TokenRecord {
	token: string;
	clientId: string;
	issuedAt: number;
	expiresAt: number;
	scopes: string[];
}

// In-memory token store (sufficient for single-instance local service)
const activeTokens = new Map<string, TokenRecord>();

const OAUTH_ENABLED = process.env.OAUTH_ENABLED === "true";
const CLIENT_ID = process.env.OAUTH_CLIENT_ID || "";
const CLIENT_SECRET = process.env.OAUTH_CLIENT_SECRET || "";
const TOKEN_EXPIRY = parseInt(process.env.OAUTH_TOKEN_EXPIRY_SECONDS || "3600") * 1000;

// Available scopes
const VALID_SCOPES = new Set(["tools:read", "tools:write", "tasks:read", "tasks:write", "admin"]);

/**
 * Generate a secure random token.
 */
function generateToken(): string {
	return `oat_${crypto.randomBytes(32).toString("hex")}`;
}

/**
 * Validate client credentials.
 */
function validateClient(clientId: string, clientSecret: string): boolean {
	return clientId === CLIENT_ID && clientSecret === CLIENT_SECRET;
}

/**
 * Check if a token is valid and not expired.
 */
export function validateOAuthToken(token: string): TokenRecord | null {
	const record = activeTokens.get(token);
	if (!record) return null;
	if (Date.now() > record.expiresAt) {
		activeTokens.delete(token);
		return null;
	}
	return record;
}

/**
 * Check if a token has the required scope.
 */
export function hasScope(token: string, scope: string): boolean {
	const record = validateOAuthToken(token);
	if (!record) return false;
	return record.scopes.includes(scope) || record.scopes.includes("admin");
}

/**
 * Register OAuth2 routes on the Express app.
 */
export function registerOAuthRoutes(app: express.Application): void {
	if (!OAUTH_ENABLED) {
		console.log("[OAuth] Disabled (set OAUTH_ENABLED=true to enable)");
		return;
	}

	console.log("[OAuth] Enabled with client_credentials flow");

	/**
	 * POST /oauth/token — Issue a new access token
	 * Body: { grant_type: "client_credentials", client_id, client_secret, scope? }
	 */
	app.post("/oauth/token", express.urlencoded({ extended: false }), (req, res) => {
		const { grant_type, client_id, client_secret, scope } = req.body;

		if (grant_type !== "client_credentials") {
			return res.status(400).json({
				error: "unsupported_grant_type",
				error_description: "Only client_credentials grant type is supported",
			});
		}

		if (!validateClient(client_id, client_secret)) {
			return res.status(401).json({
				error: "invalid_client",
				error_description: "Invalid client credentials",
			});
		}

		// Parse requested scopes
		const requestedScopes = scope ? scope.split(" ").filter((s: string) => VALID_SCOPES.has(s)) : ["tools:read", "tools:write", "tasks:read", "tasks:write"];

		const token = generateToken();
		const now = Date.now();

		const record: TokenRecord = {
			token,
			clientId: client_id,
			issuedAt: now,
			expiresAt: now + TOKEN_EXPIRY,
			scopes: requestedScopes,
		};

		activeTokens.set(token, record);

		// Clean up expired tokens periodically
		if (activeTokens.size > 100) {
			for (const [t, r] of activeTokens) {
				if (Date.now() > r.expiresAt) activeTokens.delete(t);
			}
		}

		res.json({
			access_token: token,
			token_type: "Bearer",
			expires_in: Math.floor(TOKEN_EXPIRY / 1000),
			scope: requestedScopes.join(" "),
		});
	});

	/**
	 * POST /oauth/revoke — Revoke an access token
	 */
	app.post("/oauth/revoke", express.urlencoded({ extended: false }), (req, res) => {
		const { token } = req.body;
		if (token) {
			activeTokens.delete(token);
		}
		res.status(200).json({ ok: true });
	});

	/**
	 * GET /oauth/introspect — Check token validity (for debugging)
	 */
	app.post("/oauth/introspect", express.urlencoded({ extended: false }), (req, res) => {
		const { token } = req.body;
		const record = validateOAuthToken(token);

		if (!record) {
			return res.json({ active: false });
		}

		res.json({
			active: true,
			client_id: record.clientId,
			scope: record.scopes.join(" "),
			exp: Math.floor(record.expiresAt / 1000),
			iat: Math.floor(record.issuedAt / 1000),
		});
	});
}

/**
 * Check if OAuth is enabled.
 */
export function isOAuthEnabled(): boolean {
	return OAUTH_ENABLED;
}
