import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AiAnalysis, CharacterProfile, ScoredVehicle, VehicleCatalog, VehicleEntry } from '../types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

let catalog: VehicleCatalog | null = null;

export function loadVehicleCatalog(): VehicleCatalog {
  if (catalog) return catalog;
  const path = join(__dirname, '..', '..', 'data', 'vehicles.json');
  catalog = JSON.parse(readFileSync(path, 'utf8')) as VehicleCatalog;
  return catalog;
}

const INCOME_TIER_SCORE: Record<string, Record<string, number>> = {
  low: { low: 15, lower_mid: 8, mid: 0, upper_mid: -5, high: -10 },
  lower_mid: { low: 10, lower_mid: 15, mid: 8, upper_mid: 0, high: -5 },
  mid: { low: 0, lower_mid: 10, mid: 15, upper_mid: 8, high: 0 },
  upper_mid: { low: -5, lower_mid: 0, mid: 10, upper_mid: 15, high: 8 },
  high: { low: -10, lower_mid: -5, mid: 5, upper_mid: 10, high: 15 },
};

const JOB_ALIASES: Record<string, string[]> = {
  police: ['police', 'sheriff', 'security', 'law_enforcement', 'government', 'municipal'],
  criminal: ['criminal', 'criminal_low_profile', 'gang', 'smuggler'],
  worker: ['worker', 'blue_collar', 'warehouse', 'construction', 'delivery', 'courier', 'farmer', 'miner', 'scrapper'],
  business: ['business', 'white_collar', 'office', 'corporate', 'small_business'],
  mechanic: ['mechanic', 'service'],
  unemployed: ['unemployed', 'civilian', 'student'],
  civilian: ['civilian', 'worker', 'unemployed', 'student', 'family'],
  other: ['civilian', 'worker', 'student'],
};

/** Maps catalog `class` values to preference buckets */
const CLASS_GROUPS: Record<string, string[]> = {
  suv: ['suv'],
  sedan: ['sedan', 'old_sedan'],
  compact: ['compact'],
  pickup: ['pickup'],
  van: ['van'],
  offroad: ['offroad', 'pickup', 'suv'],
  muscle: ['muscle'],
  sports: ['sports'],
  motorcycle: ['motorcycle'],
  bmx: ['bmx'],
};

const BODY_TYPE_KEYWORDS: Record<string, string[]> = {
  suv: ['suv', 'crossover', 'explorer', 'jeep', 'arazi', 'kamp', 'offroad', '4x4', 'uzun yol', 'balik', 'balık', 'aile'],
  pickup: ['pickup', 'kamyonet', 'truck', 'pikap', 'esnaf', 'inşaat', 'insaat', 'tesisat', 'elektrik'],
  sedan: ['sedan', 'saloon', 'limuzin'],
  compact: ['compact', 'kompakt', 'ilk arac', 'ilk araç', 'öğrenci', 'ogrenci', 'kurye'],
  van: ['minivan', 'van', 'minibüs', 'minibus', 'kargo', 'karavan', 'servis'],
  offroad: ['offroad', 'arazi', 'trail', 'dirt', 'çöl', 'col', 'sandy shores', 'madenci', 'hurda'],
  motorcycle: ['motor', 'motosiklet', 'faggio', 'manchez'],
  bmx: ['bmx', 'bisiklet', 'cruiser', 'fixter', 'ehliyetsiz'],
};

const REGION_KEYWORDS: Record<string, string[]> = {
  rural: ['sandy shores', 'grapeseed', 'paleto', 'blaine county', 'kasaba', 'kırsal', 'kirsal', 'çiftçi', 'ciftci'],
  beach: ['sahil', 'beach', 'vespucci'],
  urban: ['los santos', 'şehir', 'sehir', 'downtown', 'mahallesinde'],
};

const LIFESTYLE_KEYWORDS: Record<string, string[]> = {
  lowrider: ['lowrider', 'voodoo', 'mahalle', 'gang', 'eski okul'],
  student: ['öğrenci', 'ogrenci', 'üniversite', 'universite', 'ilk aracı', 'ilk araci'],
  delivery: ['kurye', 'pizza', 'kargo', 'dağıtım', 'dagitim'],
  outdoor: ['kamp', 'balık', 'balik', 'avcılık', 'avcilik', 'doğa', 'doga'],
  service: ['tamirci', 'tesisatçı', 'tesisatci', 'elektrikçi', 'elektrikci', 'inşaat', 'insaat'],
};

function profileSearchText(profile: CharacterProfile): string {
  return `${profile.vehicle_need} ${profile.dominant_vibes.join(' ')} ${(profile.personality ?? []).join(' ')} ${profile.origin} ${profile.lifestyle} ${profile.job_type}`.toLowerCase();
}

function inferPreferredBodyClasses(profile: CharacterProfile): string[] {
  const text = profileSearchText(profile);
  const preferred = new Set<string>();

  for (const [bodyClass, keywords] of Object.entries(BODY_TYPE_KEYWORDS)) {
    if (keywords.some((keyword) => text.includes(keyword))) {
      preferred.add(bodyClass);
    }
  }

  if (profile.origin === 'rural' && profile.lifestyle !== 'flashy') {
    preferred.add('suv');
    preferred.add('pickup');
    preferred.add('offroad');
  }

  return [...preferred];
}

function bodyClassMatchesPreference(vehicleClass: string, preferred: string[]): boolean {
  if (preferred.length === 0) return false;
  return preferred.some((pref) => (CLASS_GROUPS[pref] ?? [pref]).includes(vehicleClass));
}

function bodyClassConflictsPreference(vehicleClass: string, preferred: string[]): boolean {
  if (preferred.length === 0) return false;
  const wantsSuvOrTruck = preferred.some((p) => p === 'suv' || p === 'pickup' || p === 'offroad');
  if (!wantsSuvOrTruck) return false;
  return vehicleClass === 'sedan' || vehicleClass === 'old_sedan' || vehicleClass === 'sports';
}

function overlapCount(a: string[], b: string[]): number {
  const setB = new Set(b.map((x) => x.toLowerCase()));
  return a.filter((x) => setB.has(x.toLowerCase())).length;
}

function keywordHit(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

function getEffectiveAge(profile: CharacterProfile): number | undefined {
  if (typeof profile.age === 'number') return profile.age;
  return undefined;
}

function ageLicenseScore(profile: CharacterProfile, vehicle: VehicleEntry): number {
  const age = getEffectiveAge(profile);
  if (age === undefined) return 0;

  const licenseType = vehicle.license_type ?? (vehicle.class === 'bmx' ? 'bicycle' : 'car');
  if (age < 16) {
    return licenseType === 'bicycle' ? 140 : -300;
  }

  let score = 0;
  const minAge = vehicle.min_age ?? (licenseType === 'bicycle' ? 0 : 16);
  if (age < minAge) score -= 160;

  if (age < 18) {
    if (vehicle.class === 'muscle' || vehicle.class === 'motorcycle') score -= 50;
    if (vehicle.flashiness >= 4 || vehicle.attention_level >= 4) score -= 30;
    if (vehicle.class === 'compact' || vehicle.class === 'bmx') score += 20;
  }

  return score;
}

function buildReason(profile: CharacterProfile, vehicle: VehicleEntry, score: number): string {
  const shared = profile.dominant_vibes.filter((v) =>
    vehicle.vibes.some((vv) => vv.toLowerCase() === v.toLowerCase()),
  );
  const vibeText = shared.length > 0 ? shared.join(', ') : profile.lifestyle;
  const ageText = profile.age !== undefined ? ` Yas: ${profile.age}.` : '';
  return `${vehicle.label}: ${vibeText} profiline uyum (${Math.round(score)} puan). ${vehicle.class} / ${vehicle.price_tier} segment.${ageText}`;
}

export function scoreVehicle(profile: CharacterProfile, vehicle: VehicleEntry): number {
  return Math.max(0, Math.min(100, scoreVehicleRaw(profile, vehicle)));
}

export function scoreVehicleRaw(profile: CharacterProfile, vehicle: VehicleEntry): number {
  let score = 0;

  const vibeOverlap = overlapCount(profile.dominant_vibes, vehicle.vibes);
  score += vibeOverlap * 40;
  const text = profileSearchText(profile);

  for (const [region, keywords] of Object.entries(REGION_KEYWORDS)) {
    if (keywordHit(text, keywords) && vehicle.vibes.includes(region)) score += 20;
  }

  for (const [lifestyle, keywords] of Object.entries(LIFESTYLE_KEYWORDS)) {
    if (keywordHit(text, keywords) && vehicle.vibes.includes(lifestyle)) score += 25;
  }

  const jobKeys = JOB_ALIASES[profile.job_type] ?? [profile.job_type];
  const jobFit = vehicle.fits_jobs.some((j) =>
    jobKeys.some((k) => j.toLowerCase() === k.toLowerCase() || j.toLowerCase().includes(k.toLowerCase())),
  );
  score += jobFit ? 20 : -5;

  const tierMap = INCOME_TIER_SCORE[profile.income_level] ?? INCOME_TIER_SCORE.mid;
  score += tierMap[vehicle.price_tier] ?? 0;

  const flashDelta = Math.abs(profile.flashiness - vehicle.flashiness);
  score -= flashDelta * 10;

  const personality = profile.personality ?? [];
  const badHit = overlapCount(
    [...profile.dominant_vibes, profile.lifestyle, profile.job_type, ...personality],
    vehicle.bad_fits,
  );
  score -= badHit * 30;

  const personalityFit = overlapCount(personality, vehicle.fits_personality);
  score += personalityFit * 5;

  score += (vehicle.realism_score ?? 5) * 0.5;
  score += ageLicenseScore(profile, vehicle);

  if (profile.lifestyle === 'low_profile' && vehicle.attention_level >= 5) {
    score -= 15;
  }
  if (profile.lifestyle === 'flashy' && vehicle.flashiness <= 2) {
    score -= 10;
  }

  const preferredBodies = inferPreferredBodyClasses(profile);
  if (bodyClassMatchesPreference(vehicle.class, preferredBodies)) {
    score += 45;
  } else if (bodyClassConflictsPreference(vehicle.class, preferredBodies)) {
    score -= 45;
  }

  if (profile.age !== undefined && profile.age < 16 && vehicle.class !== 'bmx') {
    score -= 500;
  }

  return Math.max(0, score);
}

export function rankVehicles(profile: CharacterProfile, limit = 5): ScoredVehicle[] {
  const { vehicles } = loadVehicleCatalog();
  const scored = vehicles
    .map((vehicle) => {
      const rawScore = scoreVehicleRaw(profile, vehicle);
      return {
        vehicle: vehicle.model,
        label: vehicle.label,
        rawScore,
        score: Math.round(Math.min(100, rawScore)),
        reason: buildReason(profile, vehicle, Math.min(100, rawScore)),
      };
    })
    .sort((a, b) => b.rawScore - a.rawScore);

  return scored.slice(0, limit).map(({ rawScore: _raw, ...item }) => item);
}

export function mergeRecommendations(
  analysis: AiAnalysis,
  ranked: ScoredVehicle[],
): ScoredVehicle[] {
  return ranked.map((item, index) => ({
    ...item,
    reason: item.reason || `Profil uyumu #${index + 1}`,
  }));
}

export function needsManualReview(analysis: AiAnalysis, recommendations: ScoredVehicle[]): boolean {
  if (analysis.needs_admin_review) return true;
  if (recommendations.length < 2) return true;
  const gap = recommendations[0].score - recommendations[1].score;
  return gap < 10;
}
