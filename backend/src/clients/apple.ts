import crypto from "crypto";
import { env } from "../config/env";

export interface AppleAuthConfig {
  teamId: string;
  keyId: string;
  clientId: string;
  privateKey: string;
}

/**
 * Generates an ES256 JWT client_secret for Apple's REST API.
 * Uses Node's built-in crypto module with IEEE P1363 signature encoding.
 */
export function generateAppleClientSecret(config: AppleAuthConfig): string {
  const header = {
    alg: "ES256",
    kid: config.keyId,
  };

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: config.teamId,
    iat: now,
    exp: now + 3600, // 1 hour expiration
    aud: "https://appleid.apple.com",
    sub: config.clientId,
  };

  const encodedHeader = Buffer.from(JSON.stringify(header)).toString("base64url");
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;

  // Support multi-line private keys passed as a one-liner with literal \n
  const formattedKey = config.privateKey.includes("\\n")
    ? config.privateKey.replace(/\\n/g, "\n")
    : config.privateKey;

  const sign = crypto.createSign("SHA256");
  sign.update(unsignedToken);
  // Apple's ES256 requires raw (r || s, 64 bytes) IEEE P1363 signature encoding
  const signature = sign.sign({ key: formattedKey, dsaEncoding: "ieee-p1363" });

  return `${unsignedToken}.${signature.toString("base64url")}`;
}

/**
 * Revokes an Apple authorization code using the Sign in with Apple REST API.
 * Step 1: Exchange authorization_code for a refresh_token via /auth/token.
 * Step 2: Revoke the refresh_token via /auth/revoke.
 */
export async function revokeAppleAuthorizationCode(
  authorizationCode: string,
  customConfig?: AppleAuthConfig,
): Promise<{ success: boolean; revoked: boolean; error?: string }> {
  const config: AppleAuthConfig | null = customConfig ?? (
    env.APPLE_TEAM_ID && env.APPLE_KEY_ID && env.APPLE_CLIENT_ID && env.APPLE_PRIVATE_KEY
      ? {
          teamId: env.APPLE_TEAM_ID,
          keyId: env.APPLE_KEY_ID,
          clientId: env.APPLE_CLIENT_ID,
          privateKey: env.APPLE_PRIVATE_KEY,
        }
      : null
  );

  if (!config) {
    console.warn(
      "[Apple Auth] Apple credentials (APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_CLIENT_ID, APPLE_PRIVATE_KEY) not configured. Skipping Apple token revocation.",
    );
    return { success: false, revoked: false, error: "Apple credentials not configured" };
  }

  try {
    const clientSecret = generateAppleClientSecret(config);

    // Step 1: Exchange authorization code for refresh_token
    const tokenParams = new URLSearchParams({
      client_id: config.clientId,
      client_secret: clientSecret,
      code: authorizationCode,
      grant_type: "authorization_code",
    });

    const tokenRes = await fetch("https://appleid.apple.com/auth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenParams.toString(),
    });

    const tokenData = (await tokenRes.json()) as {
      access_token?: string;
      refresh_token?: string;
      error?: string;
    };

    if (!tokenRes.ok || !tokenData.refresh_token) {
      console.warn("[Apple Auth] Failed to exchange authorization code for refresh token:", tokenData);
      return { success: false, revoked: false, error: tokenData.error ?? "Failed to obtain refresh token" };
    }

    // Step 2: Revoke the refresh token
    const revokeParams = new URLSearchParams({
      client_id: config.clientId,
      client_secret: clientSecret,
      token: tokenData.refresh_token,
      token_type_hint: "refresh_token",
    });

    const revokeRes = await fetch("https://appleid.apple.com/auth/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: revokeParams.toString(),
    });

    if (!revokeRes.ok) {
      const errText = await revokeRes.text();
      console.warn("[Apple Auth] Failed to revoke Apple token:", errText);
      return { success: false, revoked: false, error: errText };
    }

    console.log("[Apple Auth] Successfully revoked Apple token.");
    return { success: true, revoked: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[Apple Auth] Error during Apple token revocation:", message);
    return { success: false, revoked: false, error: message };
  }
}
