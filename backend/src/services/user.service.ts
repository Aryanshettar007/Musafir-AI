import { User, type UserDoc } from "../models/user.model";
import { Trip } from "../models/trip.model";
import { Listen } from "../models/listen.model";
import { Report } from "../models/report.model";
import { notFound } from "../errors";
import { resolveProfile, type Profile, type ProfileInput } from "./profile";
import { revokeAppleAuthorizationCode } from "../clients/apple";
import { revokeGoogleToken } from "../clients/googleAuth";
import { getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

export interface Identity {
  uid: string;
  email?: string;
}

// The shape GET/PUT/PATCH /me return. Never expose Mongo internals (_id, __v) or the Firebase uid.
export interface ProfileDto extends Profile {
  email?: string;
  createdAt: string;
  updatedAt: string;
}

export async function getProfile(identity: Identity): Promise<ProfileDto> {
  const user = await User.findOne({ firebaseUid: identity.uid }).lean();
  if (!user) throw profileNotFound();
  return toDto(user);
}

// PUT /me: onboarding. Creates the profile, or replaces it with `input` on top of defaults.
export async function putProfile(identity: Identity, input: ProfileInput): Promise<{ profile: ProfileDto; created: boolean }> {
  const profile = await resolveProfile(null, input, identity.uid);
  const result = await User.findOneAndUpdate(
    { firebaseUid: identity.uid },
    {
      $set: { ...profile, email: identity.email },
      // A replaced profile must not keep an old name/age the user left out this time.
      $unset: { ...(profile.name === undefined && { name: 1 }), ...(profile.age === undefined && { age: 1 }) },
    },
    { upsert: true, new: true, runValidators: true, includeResultMetadata: true, lean: true },
  );
  if (!result.value) throw new Error("Upsert returned no document");
  return { profile: toDto(result.value), created: !result.lastErrorObject?.updatedExisting };
}

// PATCH /me: change some settings after onboarding.
export async function patchProfile(identity: Identity, input: ProfileInput): Promise<ProfileDto> {
  const existing = await User.findOne({ firebaseUid: identity.uid }).lean();
  if (!existing) throw profileNotFound();
  const profile = await resolveProfile(toProfile(existing), input, identity.uid);
  const updated = await User.findOneAndUpdate(
    { firebaseUid: identity.uid },
    { $set: { ...profile, email: identity.email ?? existing.email } },
    { new: true, runValidators: true, lean: true },
  );
  if (!updated) throw profileNotFound();
  return toDto(updated);
}

export interface DeleteAccountInput {
  appleAuthorizationCode?: string;
  googleToken?: string;
}

// DELETE /me: deletes user data from MongoDB (User, Trips, Listens, Reports) and revokes social auth tokens.
export async function deleteAccount(
  identity: Identity,
  input?: DeleteAccountInput,
): Promise<{ deleted: boolean }> {
  const uid = identity.uid;

  // 1. Delete all user data across all collections in MongoDB
  await Promise.all([
    User.deleteOne({ firebaseUid: uid }),
    Trip.deleteMany({ userId: uid }),
    Listen.deleteMany({ userId: uid }),
    Report.deleteMany({ userId: uid }),
  ]);

  // 2. Revoke Apple token if authorization code provided
  if (input?.appleAuthorizationCode) {
    try {
      await revokeAppleAuthorizationCode(input.appleAuthorizationCode);
    } catch (err) {
      console.warn("[deleteAccount] Apple revocation error:", err);
    }
  }

  // 3. Revoke Google token if provided
  if (input?.googleToken) {
    try {
      await revokeGoogleToken(input.googleToken);
    } catch (err) {
      console.warn("[deleteAccount] Google revocation error:", err);
    }
  }

  // 4. If Firebase Admin has admin credentials, delete from Firebase Auth too
  try {
    const apps = getApps();
    if (apps.length > 0) {
      await getAuth(apps[0]).deleteUser(uid);
    }
  } catch (err: unknown) {
    // Expected when firebase-admin is only configured for ID token verification without service account credentials.
    // Client SDK will perform deleteUser(currentUser).
  }

  return { deleted: true };
}

function profileNotFound() {
  return notFound("PROFILE_NOT_FOUND", "No profile yet. Finish onboarding with PUT /me.");
}

function toProfile(user: UserDoc): Profile {
  return {
    name: user.name ?? undefined,
    gender: user.gender,
    age: user.age ?? undefined,
    language: user.language,
    voiceGender: user.voiceGender,
    voice: user.voice,
    interests: user.interests,
    musicMode: user.musicMode,
  };
}

function toDto(user: UserDoc): ProfileDto {
  return {
    ...toProfile(user),
    email: user.email ?? undefined,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}
