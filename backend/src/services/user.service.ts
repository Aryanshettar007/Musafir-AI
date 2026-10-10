import { User, type UserDoc } from "../models/user.model";
import { notFound } from "../errors";
import { resolveProfile, type Profile, type ProfileInput } from "./profile";

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
  const profile = resolveProfile(null, input);
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
  const profile = resolveProfile(toProfile(existing), input);
  const updated = await User.findOneAndUpdate(
    { firebaseUid: identity.uid },
    { $set: { ...profile, email: identity.email ?? existing.email } },
    { new: true, runValidators: true, lean: true },
  );
  if (!updated) throw profileNotFound();
  return toDto(updated);
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
