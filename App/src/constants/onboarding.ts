export const GENDERS = [
  'Male',
  'Female',
  'Prefer not to say',
] as const;

export type Gender = (typeof GENDERS)[number];

export const AGE_RANGES = [
  'Under 18',
  '18 – 24',
  '25 – 34',
  '35 – 44',
  '45 – 54',
  '55 – 64',
  '65+',
] as const;

export type AgeRange = (typeof AGE_RANGES)[number];
export const DEFAULT_AGE_RANGE: AgeRange = '18 – 24';

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
  { id: 'history', value: 'history', label: 'History & Heritage' },
  { id: 'architecture', value: 'architecture', label: 'Forts & Architecture' },
  { id: 'spirituality', value: 'spirituality', label: 'Temples & Spirituality' },
  { id: 'food', value: 'food', label: 'Food & Local Eats' },
  { id: 'nature', value: 'nature', label: 'Nature & Wildlife' },
  { id: 'adventure', value: 'adventure', label: 'Adventure & Trekking' },
  { id: 'art-culture', value: 'art-culture', label: 'Art, Crafts & Museums' },
  { id: 'legends', value: 'legends', label: 'Myths & Legends' },
  { id: 'cinema', value: 'cinema', label: 'Cinema & Pop Culture' },
] as const;

export type InterestId = (typeof INTERESTS)[number]['id'];
export type Interest = InterestId;
export const DEFAULT_INTERESTS: InterestId[] = ['history', 'food'];
