/**
 * Revokes a Google OAuth token via Google's token revocation endpoint.
 * This removes app authorization from the user's Google Account permissions.
 */
export async function revokeGoogleToken(token: string): Promise<boolean> {
  if (!token || !token.trim()) return false;

  try {
    const res = await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token.trim())}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });

    if (res.ok) {
      console.log("[Google Auth] Successfully revoked Google token.");
      return true;
    }

    const text = await res.text();
    console.warn("[Google Auth] Google token revocation returned non-200:", text);
    return false;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[Google Auth] Error during Google token revocation:", message);
    return false;
  }
}
