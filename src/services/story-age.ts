import type { CharacterProfile } from '../types.js';

/** RP sunucusu referans yili — hikayeler 2026'da biter. */
export const STAGE_REFERENCE_YEAR = 2026;

const BIRTH_YEAR_PATTERNS: RegExp[] = [
  /\b(19\d{2}|20[0-1]\d)\s*(?:['']?(?:da|de|te|ta)|yılında|yilinda)\s*do[ğg]/gi,
  /do[ğg](?:um(?:lu| tarihi)?|du(?:ğu|gu)?)\s*[:\-]?\s*(19\d{2}|20[0-1]\d)/gi,
  /born\s+(?:in\s+)?(19\d{2}|20[0-1]\d)/gi,
  /\b(19\d{2}|20[0-1]\d)\s*do[ğg]umlu/gi,
  /do[ğg]um\s*y[ıi]l[ıi]\s*[:\-]?\s*(19\d{2}|20[0-1]\d)/gi,
];

const EXPLICIT_AGE_PATTERN = /\b(\d{1,2})\s*ya[sş][ıi]?(?:nda|indayken|ında)?\b/gi;

function isValidBirthYear(year: number): boolean {
  return year >= 1940 && year <= STAGE_REFERENCE_YEAR - 10;
}

export function extractBirthYearFromStory(story: string): number | null {
  for (const pattern of BIRTH_YEAR_PATTERNS) {
    pattern.lastIndex = 0;
    let match = pattern.exec(story);
    while (match) {
      const year = Number.parseInt(match[1], 10);
      if (isValidBirthYear(year)) return year;
      match = pattern.exec(story);
    }
  }
  return null;
}

export function extractExplicitAgeFromStory(story: string): number | null {
  EXPLICIT_AGE_PATTERN.lastIndex = 0;
  const matches = [...story.matchAll(EXPLICIT_AGE_PATTERN)];
  if (matches.length === 0) return null;

  const last = matches[matches.length - 1];
  const age = Number.parseInt(last[1], 10);
  if (age >= 14 && age <= 90) return age;
  return null;
}

export function ageFromBirthYear(birthYear: number): number {
  return STAGE_REFERENCE_YEAR - birthYear;
}

export function inferAgeGroup(age: number): CharacterProfile['age_group'] {
  if (age <= 25) return 'young';
  if (age <= 44) return 'adult';
  if (age <= 59) return 'middle_aged';
  return 'old';
}

/** Hikaye metni + AI yasini 2026 referansina gore birlestirir. Dogum yili > acik yas > AI. */
export function resolveCharacterAge(story: string, aiAge?: number): number | undefined {
  const birthYear = extractBirthYearFromStory(story);
  if (birthYear !== null) {
    return ageFromBirthYear(birthYear);
  }

  const explicitAge = extractExplicitAgeFromStory(story);
  if (explicitAge !== null) return explicitAge;

  if (typeof aiAge === 'number' && aiAge >= 14 && aiAge <= 90) {
    return Math.round(aiAge);
  }

  return undefined;
}

export function applyStoryAgeContext(story: string, profile: CharacterProfile): void {
  const resolved = resolveCharacterAge(story, profile.age);
  if (resolved === undefined) return;

  profile.age = resolved;
  profile.age_group = inferAgeGroup(resolved);
}
