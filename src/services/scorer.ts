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

const PURPOSE_KEYWORDS: Record<string, string[]> = {
  equipment_transport: ['ekipman', 'malzeme', 'parça', 'parca', 'ses sistemi', 'subwoofer', 'kaplama', 'folyo', 'alet', 'takım', 'takim', 'tesisat', 'elektrik', 'inşaat', 'insaat'],
  work: [' iş ', ' is ', 'işi', 'isi', 'işinde', 'isinde', 'çalışıyor', 'calisiyor', 'kasiyer', 'tamirci', 'kurye', 'kargo', 'depo', 'servis', 'esnaf', 'tesisat', 'elektrik', 'inşaat', 'insaat'],
  daily_commute: ['günlük', 'gunluk', 'işe gidip', 'ise gidip', 'okula', 'şehir içi', 'sehir ici', 'yakıt', 'yakit', 'ekonomik', 'ilk araç', 'ilk arac'],
  family: ['aile', 'çocuk', 'cocuk', 'kardeş', 'kardes', 'eşya', 'esya', 'family'],
  recreation: ['kamp', 'balık', 'balik', 'av', 'sahil', 'hafta sonu', 'doğa', 'doga'],
  project: ['garaj', 'proje', 'modifiye', 'restore', 'restorasyon', 'motor toplama'],
  status: ['statü', 'statu', 'prestij', 'lüks', 'luks', 'gösteriş', 'gosteris'],
};

const PURPOSE_TAGS: Record<string, string[]> = {
  equipment_transport: ['equipment_transport', 'contractor_vehicle', 'service_vehicle', 'utility_pickup', 'work_truck', 'cargo_van'],
  work: ['service_vehicle', 'fleet_vehicle', 'work_truck', 'contractor_vehicle', 'cargo_van', 'utility_pickup', 'daily_driver'],
  daily_commute: ['starter_car', 'daily_driver', 'fuel_economy', 'delivery_vehicle'],
  family: ['family_vehicle', 'daily_driver', 'equipment_transport'],
  recreation: ['recreation', 'weekend_car', 'family_vehicle', 'utility_pickup'],
  project: ['project_car', 'utility_pickup', 'weekend_car'],
  weekend: ['weekend_car', 'project_car', 'recreation'],
  status: ['status_vehicle', 'weekend_car'],
};

const HOBBY_ONLY_KEYWORDS = ['basketbol', 'basketball', 'futbol', 'spor', 'music', 'müzik', 'muzik', 'dans'];
const VEHICLE_SKILL_KEYWORDS = ['garaj', 'kaplama', 'ses sistemi', 'tamir', 'mekanik', 'modifiye', 'parça', 'parca'];
const PERFORMANCE_VIBES = ['racer', 'street_meet', 'entry_tuner', 'powerful', 'flashy', 'high_status'];
const URBAN_CUSTOMS_KEYWORDS = ['los santos', 'şehir', 'sehir', 'şehir içi', 'sehir ici', 'şehirli', 'sehirli', 'mahalle', 'ses sistemi', 'kaplama', 'wrap', 'folyo', 'müşteri', 'musteri'];
const RURAL_SCRAP_KEYWORDS = ['sandy shores', 'grapeseed', 'paleto', 'blaine county', 'hurda', 'hurdacı', 'hurdaci', 'scrap', 'scrapper', 'çiftçi', 'ciftci', 'tarla', 'kaynak', 'çekici', 'cekici'];
const TOWN_TO_CITY_WORK_KEYWORDS = ['kasabadan şehire', 'kasabadan sehire', 'şehir dışı', 'sehir disi', 'şehir dışından', 'sehir disindan', 'kasaba işi', 'kasaba isi', 'blaine county', 'sandy shores', 'grapeseed', 'paleto'];
const RURAL_ONLY_VEHICLES = ['dloader', 'rebel'];

const REGION_KEYWORDS: Record<string, string[]> = {
  rural: ['sandy shores', 'grapeseed', 'paleto', 'blaine county', 'kasaba', 'kırsal', 'kirsal', 'çiftçi', 'ciftci'],
  beach: ['sahil', 'beach', 'vespucci'],
  urban: ['los santos', 'şehir', 'sehir', 'downtown', 'mahallesinde'],
};

const LIFESTYLE_KEYWORDS: Record<string, string[]> = {
  lowrider: ['lowrider', 'voodoo', 'eski okul', 'old school', 'old_school', 'collector', 'koleksiyoncu', 'mahalle klasiği', 'mahalle klasigi', 'old_school_gang'],
  modern_gang: ['modern çete', 'modern cete', '2026', 'yeni nesil çete', 'yeni nesil cete', 'organize suç', 'organize suc', 'gang', 'çete', 'cete'],
  rich_criminal: ['zengin çeteci', 'zengin ceteci', 'para aklama', 'lüks', 'luks', 'high status', 'temiz görünen', 'temiz gorunen', 'zengin gorunumlu', 'zengin görünümlü'],
  low_profile_criminal: ['low profile', 'dikkat çekmeyen', 'dikkat cekmeyen', 'temiz plaka', 'sivil gorunum', 'sivil görünüm'],
  student: ['öğrenci', 'ogrenci', 'üniversite', 'universite', 'ilk aracı', 'ilk araci'],
  delivery: ['kurye', 'pizza', 'kargo', 'dağıtım', 'dagitim'],
  outdoor: ['kamp', 'balık', 'balik', 'avcılık', 'avcilik', 'doğa', 'doga'],
  service: ['tamirci', 'tesisatçı', 'tesisatci', 'elektrikçi', 'elektrikci', 'inşaat', 'insaat'],
  father_legacy: ['babasından', 'babasindan', 'babadan', 'babası', 'babasi', 'aile yadigarı', 'aile yadigari', 'miras', 'kalan araç', 'kalan arac'],
  inherited: ['yadigar', 'yadigarı', 'yadigari', 'miras', 'eski aile aracı', 'eski aile araci'],
  serious: ['ciddi', 'sert', 'soğuk', 'soguk', 'disiplinli', 'az konuşan', 'az konusan'],
  tough: ['sert', 'güçlü', 'guclu', 'dayanıklı', 'dayanikli', 'korkusuz', 'otoriter'],
};

function profileSearchText(profile: CharacterProfile): string {
  return `${profile.vehicle_need} ${profile.vehicle_purpose ?? ''} ${profile.financial_pressure ?? ''} ${profile.family_support ?? ''} ${profile.life_stage ?? ''} ${profile.career_stage ?? ''} ${profile.dominant_vibes.join(' ')} ${(profile.personality ?? []).join(' ')} ${profile.gender ?? ''} ${profile.origin} ${profile.lifestyle} ${profile.job_type}`.toLowerCase();
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

function isUrbanCustomsProfile(profile: CharacterProfile): boolean {
  const text = profileSearchText(profile);
  return profile.origin === 'urban'
    && keywordHit(text, URBAN_CUSTOMS_KEYWORDS)
    && keywordHit(text, ['garaj', 'kaplama', 'ses sistemi', 'tamir', 'mekanik', 'parça', 'parca']);
}

function isTownToCityWorkProfile(profile: CharacterProfile): boolean {
  const text = profileSearchText(profile);
  const hasRuralBase = profile.origin === 'rural'
    || profile.origin === 'small_town'
    || keywordHit(text, TOWN_TO_CITY_WORK_KEYWORDS)
    || profile.dominant_vibes.some((v) => ['rural', 'small_town', 'sandy_shores', 'scrapper', 'farmer', 'miner'].includes(v));
  const hasWorkPurpose = profile.vehicle_purpose === 'work'
    || profile.vehicle_purpose === 'equipment_transport'
    || keywordHit(text, PURPOSE_KEYWORDS.work)
    || keywordHit(text, PURPOSE_KEYWORDS.equipment_transport);
  return hasRuralBase && hasWorkPurpose;
}

function ruralOnlyVehicleScore(profile: CharacterProfile, vehicle: VehicleEntry): number {
  if (!RURAL_ONLY_VEHICLES.includes(vehicle.model)) return 0;
  if (isTownToCityWorkProfile(profile)) return 35;
  if (profile.origin === 'urban' || keywordHit(profileSearchText(profile), URBAN_CUSTOMS_KEYWORDS)) return -140;
  return -80;
}

function inferVehiclePurposes(profile: CharacterProfile): string[] {
  const text = profileSearchText(profile);
  const purposes = new Set<string>();
  if (profile.vehicle_purpose) purposes.add(profile.vehicle_purpose);

  for (const [purpose, keywords] of Object.entries(PURPOSE_KEYWORDS)) {
    if (keywordHit(text, keywords)) purposes.add(purpose);
  }

  if (profile.life_stage === 'first_vehicle' || profile.career_stage === 'student') {
    purposes.add('daily_commute');
  }
  if (profile.career_stage === 'new_worker') {
    purposes.add('daily_commute');
  }
  if (profile.lifestyle === 'family') purposes.add('family');

  return [...purposes];
}

function hasUtilityTag(vehicle: VehicleEntry, tags: string[]): boolean {
  const utilityTags = vehicle.utility_tags ?? [];
  return tags.some((tag) => utilityTags.includes(tag));
}

function purposeScore(profile: CharacterProfile, vehicle: VehicleEntry): number {
  const purposes = inferVehiclePurposes(profile);
  if (purposes.length === 0) return 0;

  let score = 0;
  for (const purpose of purposes) {
    const tags = PURPOSE_TAGS[purpose] ?? [];
    if (hasUtilityTag(vehicle, tags)) score += 45;

    if (purpose === 'equipment_transport') {
      if (vehicle.class === 'van' || vehicle.class === 'pickup') score += 25;
      if (vehicle.class === 'offroad') score += isTownToCityWorkProfile(profile) ? 25 : -40;
      if (vehicle.class === 'sports' || vehicle.flashiness >= 5) score -= 55;
      if (vehicle.class === 'compact' || vehicle.class === 'bmx' || vehicle.class === 'motorcycle') score -= 20;
    }

    if (purpose === 'daily_commute') {
      if (vehicle.class === 'compact' || vehicle.class === 'sedan' || vehicle.class === 'bmx' || vehicle.class === 'motorcycle') score += 25;
      if (vehicle.attention_level >= 4 || vehicle.flashiness >= 5) score -= 35;
    }

    if (purpose === 'family') {
      if (vehicle.class === 'suv' || vehicle.class === 'van' || vehicle.class === 'sedan') score += 25;
      if (vehicle.class === 'motorcycle' || vehicle.class === 'bmx' || vehicle.class === 'sports') score -= 55;
    }

    if (purpose === 'work') {
      if (vehicle.class === 'van' || hasUtilityTag(vehicle, ['work_truck', 'service_vehicle', 'fleet_vehicle'])) score += 20;
      if (vehicle.class === 'offroad') score += isTownToCityWorkProfile(profile) ? 20 : -35;
      if (vehicle.flashiness >= 5) score -= 30;
    }
  }

  if (isUrbanCustomsProfile(profile)) {
    if (vehicle.model === 'dloader' || vehicle.vibes.some((v) => ['scrapper', 'miner', 'farmer', 'workhorse', 'sandy_shores', 'desert'].includes(v))) {
      score -= 90;
    }
    if (vehicle.vibes.some((v) => ['urban', 'entry_tuner', 'modding', 'street', 'clean_look'].includes(v))
      || hasUtilityTag(vehicle, ['project_car', 'daily_driver', 'service_vehicle', 'equipment_transport'])) {
      score += 35;
    }
  }

  score += ruralOnlyVehicleScore(profile, vehicle);

  return score;
}

function priceTierIndex(tier: string): number {
  return { low: 0, lower_mid: 1, mid: 2, upper_mid: 3, high: 4 }[tier] ?? 2;
}

function economicRealismScore(profile: CharacterProfile, vehicle: VehicleEntry): number {
  const incomeIndex = priceTierIndex(profile.income_level);
  const vehicleIndex = priceTierIndex(vehicle.price_tier);
  const gap = vehicleIndex - incomeIndex;
  const age = getEffectiveAge(profile);
  const earlyStage = profile.life_stage === 'first_vehicle'
    || profile.life_stage === 'early_career'
    || profile.career_stage === 'student'
    || profile.career_stage === 'new_worker'
    || profile.age_group === 'young'
    || (age !== undefined && age <= 22);
  const tightMoney = profile.income_level === 'low'
    || profile.income_level === 'lower_mid'
    || profile.financial_pressure === 'high'
    || profile.family_support === 'none'
    || profile.family_support === 'limited';
  const hasWealthBackstory = profile.family_support === 'wealthy'
    || profile.life_stage === 'successful'
    || profile.career_stage === 'established_professional';
  const performanceVehicle = vehicle.class === 'sports'
    || vehicle.flashiness >= 5
    || vehicle.vibes.some((v) => PERFORMANCE_VIBES.includes(v));
  const purpose = profile.vehicle_purpose;
  const justifiedProject = purpose === 'project' || purpose === 'weekend' || profile.life_stage === 'successful';

  let score = 0;
  if (gap <= -1) score += 8;
  if (gap === 0) score += 18;
  if (gap === 1) score -= tightMoney ? 30 : 8;
  if (gap >= 2) score -= tightMoney ? 95 : 45;

  if (earlyStage && gap >= 1 && !hasWealthBackstory) score -= 45;
  if (tightMoney && performanceVehicle && !justifiedProject) score -= 75;
  if (earlyStage && performanceVehicle && !justifiedProject) score -= 45;
  if (profile.financial_pressure === 'high' && hasUtilityTag(vehicle, ['starter_car', 'fuel_economy', 'daily_driver'])) score += 25;
  if (profile.family_support === 'wealthy' && vehicle.price_tier === 'high') score += 20;

  return score;
}

function hobbyPenalty(profile: CharacterProfile, vehicle: VehicleEntry): number {
  const text = profileSearchText(profile);
  const hobbyOnly = keywordHit(text, HOBBY_ONLY_KEYWORDS);
  const hasVehicleSkill = keywordHit(text, VEHICLE_SKILL_KEYWORDS);
  if (!hobbyOnly || hasVehicleSkill) return 0;
  if (vehicle.class === 'sports' || vehicle.flashiness >= 5 || vehicle.vibes.includes('racer')) return -45;
  return 0;
}

function hasExplicitLowriderSignal(text: string): boolean {
  return keywordHit(text, LIFESTYLE_KEYWORDS.lowrider)
    || keywordHit(text, LIFESTYLE_KEYWORDS.father_legacy)
    || keywordHit(text, LIFESTYLE_KEYWORDS.inherited);
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
  const reasons: string[] = [];
  const purposes = inferVehiclePurposes(profile);
  if (purposes.includes('equipment_transport')) reasons.push('ekipman/parca tasimaya uygun');
  if (purposes.includes('work')) reasons.push('is kullanimi icin mantikli');
  if (purposes.includes('daily_commute')) reasons.push('gunluk kullanim ve yakit ekonomisine uygun');
  if (purposes.includes('family')) reasons.push('aile/esya kullanimi icin pratik');
  if (profile.income_level === 'low' || profile.income_level === 'lower_mid') reasons.push(`${profile.income_level} gelir seviyesini zorlamaz`);
  if (profile.life_stage === 'first_vehicle' || profile.life_stage === 'early_career') reasons.push('karakterin mevcut yasam evresine uygun');
  if (shared.length > 0) reasons.push(`${shared.join(', ')} hikaye sinyalleriyle uyumlu`);
  if (reasons.length === 0) reasons.push(`${profile.lifestyle} karakter profiline uyumlu`);
  const ageText = profile.age !== undefined ? ` Yas: ${profile.age}.` : '';
  return `${vehicle.label}: ${Math.round(score)} puan. ${vehicle.class} / ${vehicle.price_tier} segment.${ageText} Sebepler: ${reasons.slice(0, 5).join('; ')}.`;
}

export function scoreVehicle(profile: CharacterProfile, vehicle: VehicleEntry): number {
  return Math.max(0, Math.min(100, scoreVehicleRaw(profile, vehicle)));
}

export function scoreVehicleRaw(profile: CharacterProfile, vehicle: VehicleEntry): number {
  let score = 0;

  const vibeOverlap = overlapCount(profile.dominant_vibes, vehicle.vibes);
  score += vibeOverlap * 24;
  const text = profileSearchText(profile);

  for (const [region, keywords] of Object.entries(REGION_KEYWORDS)) {
    if (keywordHit(text, keywords) && vehicle.vibes.includes(region)) score += 16;
  }

  for (const [lifestyle, keywords] of Object.entries(LIFESTYLE_KEYWORDS)) {
    if (keywordHit(text, keywords) && vehicle.vibes.includes(lifestyle)) score += 18;
  }

  const explicitLowrider = hasExplicitLowriderSignal(text);
  const modernCriminal = profile.job_type === 'criminal'
    && (
      keywordHit(text, LIFESTYLE_KEYWORDS.modern_gang)
      || keywordHit(text, LIFESTYLE_KEYWORDS.rich_criminal)
      || keywordHit(text, LIFESTYLE_KEYWORDS.low_profile_criminal)
      || profile.income_level === 'upper_mid'
      || profile.income_level === 'high'
    );

  if (vehicle.vibes.includes('lowrider') && !explicitLowrider) {
    score -= 90;
  }

  if (modernCriminal) {
    if (vehicle.vibes.some((v) => v === 'modern_gang' || v === 'rich_criminal' || v === 'clean_look' || v === 'low_profile_criminal' || v === 'high_status')) {
      score += 50;
    }
    if (vehicle.class === 'sedan' || vehicle.class === 'suv' || vehicle.class === 'muscle') {
      score += 15;
    }
    if (vehicle.vibes.includes('lowrider') || vehicle.vibes.includes('old_school_gang')) {
      score -= explicitLowrider ? 0 : 70;
    }
  }

  if (keywordHit(text, LIFESTYLE_KEYWORDS.father_legacy) || keywordHit(text, LIFESTYLE_KEYWORDS.inherited)) {
    if (vehicle.vibes.some((v) => v === 'father_legacy' || v === 'inherited' || v === 'old_school' || v === 'sentimental')) {
      score += 55;
    }
    if (vehicle.flashiness >= 5 || vehicle.vibes.includes('modern')) {
      score -= 25;
    }
  }

  if (keywordHit(text, LIFESTYLE_KEYWORDS.serious) || keywordHit(text, LIFESTYLE_KEYWORDS.tough)) {
    if (vehicle.vibes.some((v) => v === 'serious' || v === 'official' || v === 'tough' || v === 'disciplined')) {
      score += 35;
    }
    if (vehicle.vibes.some((v) => v === 'fun' || v === 'quirky' || v === 'eco')) {
      score -= 20;
    }
  }

  const jobKeys = JOB_ALIASES[profile.job_type] ?? [profile.job_type];
  const jobFit = vehicle.fits_jobs.some((j) =>
    jobKeys.some((k) => j.toLowerCase() === k.toLowerCase() || j.toLowerCase().includes(k.toLowerCase())),
  );
  score += jobFit ? 16 : -5;

  const tierMap = INCOME_TIER_SCORE[profile.income_level] ?? INCOME_TIER_SCORE.mid;
  score += tierMap[vehicle.price_tier] ?? 0;
  score += economicRealismScore(profile, vehicle);
  score += purposeScore(profile, vehicle);
  score += hobbyPenalty(profile, vehicle);

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

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed: string): () => number {
  let state = hashSeed(seed) || 1;
  return () => {
    state = Math.imul(state ^ (state >>> 15), 1 | state);
    state ^= state + Math.imul(state ^ (state >>> 7), 61 | state);
    return ((state ^ (state >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleWithSeed<T>(items: T[], seed: string): T[] {
  const shuffled = [...items];
  const random = seededRandom(seed);
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function diversifyCloseRecommendations(
  recommendations: ScoredVehicle[],
  seed: string,
  maxScoreGap = 5,
): ScoredVehicle[] {
  if (recommendations.length < 2) return recommendations;

  const topScore = recommendations[0].score;
  const closeCount = recommendations.findIndex((item) => topScore - item.score > maxScoreGap);
  const splitIndex = closeCount === -1 ? recommendations.length : closeCount;
  if (splitIndex < 2) return recommendations;

  return [
    ...shuffleWithSeed(recommendations.slice(0, splitIndex), seed),
    ...recommendations.slice(splitIndex),
  ];
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
