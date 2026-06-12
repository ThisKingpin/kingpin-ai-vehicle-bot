import { AiAnalysisSchema, type AiAnalysis } from '../types.js';

const PROFILE_KEYS = new Set([
  'income_level',
  'origin',
  'age_group',
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

function normalizeProfile(raw: Record<string, unknown>): Record<string, unknown> {
  let vibes = raw.dominant_vibes;
  if (typeof vibes === 'string') vibes = [vibes];
  if (!Array.isArray(vibes) || vibes.length === 0) vibes = ['practical'];

  let personality = raw.personality;
  if (typeof personality === 'string') personality = [personality];

  let flashiness = raw.flashiness;
  if (typeof flashiness === 'string') flashiness = Number(flashiness);
  if (typeof flashiness !== 'number' || Number.isNaN(flashiness)) flashiness = 5;
  flashiness = Math.min(10, Math.max(1, Math.round(flashiness)));

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
    dominant_vibes: vibes.map(String),
    ...(Array.isArray(personality) ? { personality: personality.map(String) } : {}),
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
