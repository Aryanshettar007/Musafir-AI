import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import type { Identity } from "../services/user.service";

export type VerifyIdToken = (idToken: string) => Promise<Identity>;

// Verifying ID tokens needs only the project ID (Google's public signing keys are fetched and cached by the SDK),
// so no service-account credentials are required for auth.
export function firebaseTokenVerifier(projectId: string): VerifyIdToken {
  const app = getApps()[0] ?? initializeApp({ projectId });
  const auth = getAuth(app);
  return async (idToken) => {
    const decoded = await auth.verifyIdToken(idToken);
    return { uid: decoded.uid, email: decoded.email };
  };
}
