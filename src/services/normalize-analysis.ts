import { AiAnalysisSchema, type AiAnalysis } from '../types.js';

const PROFILE_KEYS = new Set([
  'income_level',
  'origin',
  'age_group',
  'age',
  'job_type',
  'lifestyle',
  'flashiness',
  'vehicle_need',
  'dominant_vibes',
  'personality',
  'risk_level',
]);

const INCOME_ALIASES: Record<string, string> = {
  dusuk: 'low',
  düşük: 'low',
  poor: 'low',
  fakir: 'low',
  lower: 'lower_mid',
  orta_alt: 'lower_mid',
  orta: 'mid',
  middle: 'mid',
  orta_ust: 'upper_mid',
  upper: 'upper_mid',
  yuksek: 'high',
  yüksek: 'high',
  rich: 'high',
  zengin: 'high',
};

const JOB_ALIASES: Record<string, string> = {
  polis: 'police',
  sheriff: 'police',
  law: 'police',
  isci: 'worker',
  işçi: 'worker',
  mavi_yaka: 'worker',
  suc: 'criminal',
  suç: 'criminal',
  sucu: 'criminal',
  gang: 'criminal',
  isadami: 'business',
  işadamı: 'business',
  issiz: 'unemployed',
  işsiz: 'unemployed',
  tamirci: 'mechanic',
  sivil: 'civilian',
};

function coerceEnum(value: unknown, allowed: readonly string[], aliases: Record<string, string>, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const normalized = value.toLowerCase().trim().replace(/[\s-]+/g, '_');
  if (allowed.includes(normalized)) return normalized;
  if (aliases[normalized]) return aliases[normalized];
  for (const [alias, target] of Object.entries(aliases)) {
    if (normalized.includes(alias)) return target;
  }
  for (const option of allowed) {
    if (normalized.includes(option) || option.includes(normalized)) return option;
  }
  return fallback;
}

function normalizeStringArray(value: unknown, fallback: string[]): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value) && value.length > 0) return value.map(String);
  return fallback;
}

function normalizeFlashiness(value: unknown): number {
  let flashiness: number;
  if (typeof value === 'number') {
    flashiness = value;
  } else if (typeof value === 'string') {
    flashiness = Number(value);
  } else {
    flashiness = 5;
  }
  if (Number.isNaN(flashiness)) flashiness = 5;
  return Math.min(10, Math.max(1, Math.round(flashiness)));
}

function normalizeAge(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
  if (typeof value !== 'string') return undefined;
  const match = value.match(/\d{1,3}/);
  if (!match) return undefined;
  const age = Number(match[0]);
  if (!Number.isFinite(age) || age < 0 || age > 120) return undefined;
  return age;
}

function normalizeProfile(raw: Record<string, unknown>): Record<string, unknown> {
  const vibes = normalizeStringArray(raw.dominant_vibes, ['practical']);
  const personality = normalizeStringArray(raw.personality, []);
  const flashiness = normalizeFlashiness(raw.flashiness);

  return {
    income_level: coerceEnum(
      raw.income_level,
      ['low', 'lower_mid', 'mid', 'upper_mid', 'high'],
      INCOME_ALIASES,
      'mid',
    ),
    origin: coerceEnum(
      raw.origin,
      ['rural', 'small_town', 'suburban', 'urban', 'unknown'],
      { kasaba: 'small_town', koy: 'rural', köy: 'rural', sehir: 'urban', şehir: 'urban' },
      'unknown',
    ),
    age_group: coerceEnum(
      raw.age_group,
      ['young', 'adult', 'middle_aged', 'old'],
      { genc: 'young', genç: 'young', yasli: 'old', yaşlı: 'old', middle: 'middle_aged' },
      'adult',
    ),
    ...(normalizeAge(raw.age) !== undefined ? { age: normalizeAge(raw.age) } : {}),
    job_type: coerceEnum(
      raw.job_type,
      ['police', 'worker', 'criminal', 'business', 'unemployed', 'mechanic', 'civilian', 'other'],
      JOB_ALIASES,
      'civilian',
    ),
    lifestyle: coerceEnum(
      raw.lifestyle,
      ['practical', 'flashy', 'low_profile', 'family', 'criminal', 'professional', 'drifter', 'ambitious'],
      { dusuk_profil: 'low_profile', gösteris: 'flashy', gosteris: 'flashy', aile: 'family' },
      'practical',
    ),
    flashiness,
    vehicle_need: typeof raw.vehicle_need === 'string' && raw.vehicle_need.trim() ? raw.vehicle_need.trim() : 'daily transport',
    dominant_vibes: vibes,
    ...(personality.length > 0 ? { personality } : {}),
  };
}

export function normalizeAnalysisPayload(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const obj = raw as Record<string, unknown>;

  if (obj.character_profile && typeof obj.character_profile === 'object') {
    return {
      ...obj,
      character_profile: normalizeProfile(obj.character_profile as Record<string, unknown>),
    };
  }

  const nested = obj.profile ?? obj.characterProfile ?? obj.karakter_profili ?? obj.analysis;
  if (nested && typeof nested === 'object') {
    return {
      rejected_vehicle_types: obj.rejected_vehicle_types,
      risk: obj.risk ?? (nested as Record<string, unknown>).risk,
      needs_admin_review: obj.needs_admin_review,
      character_profile: normalizeProfile(nested as Record<string, unknown>),
    };
  }

  const hasProfileFields = [...PROFILE_KEYS].some((key) => key in obj);
  if (hasProfileFields) {
    const profile: Record<string, unknown> = {};
    const meta: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (PROFILE_KEYS.has(key)) profile[key] = value;
      else meta[key] = value;
    }
    return {
      ...meta,
      character_profile: normalizeProfile(profile),
    };
  }

  return raw;
}

export function parseAnalysisJson(raw: string): AiAnalysis {
  const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
  const parsed = JSON.parse(cleaned);
  const normalized = normalizeAnalysisPayload(parsed);
  return AiAnalysisSchema.parse(normalized);
}
