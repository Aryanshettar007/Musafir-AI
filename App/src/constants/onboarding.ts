export const GENDERS = [
  'Male',
  'Female',
  'Prefer not to say',
] as const;

export type Gender = (typeof GENDERS)[number];

export const PREFERRED_LANGUAGES = [
  'English',
  'Hindi',
  'Hinglish (Hindi + English)',
  'Kannada',
  'Tamil',
  'Telugu',
  'Malayalam',
  'Marathi',
  'Bengali',
  'Gujarati',
  'Punjabi',
] as const;

export type PreferredLanguage = (typeof PREFERRED_LANGUAGES)[number];

export const INTERESTS = [
  'Adventure & Trekking',
  'Heritage & History',
  'Food & Culinary',
  'Nature & Wildlife',
  'Beaches & Islands',
  'Photography',
  'Nightlife & Social',
  'Wellness & Yoga',
  'Art & Museums',
  'Road Trips',
  'Budget Backpacking',
  'Luxury & Resorts',
] as const;

export type Interest = (typeof INTERESTS)[number];
