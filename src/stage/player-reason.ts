import type { CharacterProfile, VehicleEntry } from '../types.js';

const INCOME_TR: Record<CharacterProfile['income_level'], string> = {
  low: 'düşük gelir',
  lower_mid: 'sınırlı gelir',
  mid: 'orta gelir',
  upper_mid: 'iyi gelir',
  high: 'yüksek gelir',
};

const JOB_TR: Record<CharacterProfile['job_type'], string> = {
  police: 'polis / kolluk mesleği',
  worker: 'çalışan veya esnaf profili',
  criminal: 'riskli geçmiş',
  business: 'iş / ticaret hayatı',
  unemployed: 'iş arayan veya düzensiz gelir',
  mechanic: 'tamirci / atölye / servis işi',
  civilian: 'sivil hayat',
  other: 'genel profil',
};

const LIFE_STAGE_TR: Record<NonNullable<CharacterProfile['life_stage']>, string> = {
  first_vehicle: 'ilk aracını alacak biri',
  early_career: 'kariyerinin başında',
  established: 'yerleşik bir hayat',
  successful: 'oturmuş ve başarılı biri',
};

const CAREER_TR: Record<NonNullable<CharacterProfile['career_stage']>, string> = {
  student: 'öğrenci',
  new_worker: 'yeni işe başlamış',
  stable_worker: 'düzenli çalışan',
  small_business: 'küçük esnaf / kendi işi',
  established_professional: 'tecrübeli profesyonel',
};

const ORIGIN_TR: Record<CharacterProfile['origin'], string> = {
  rural: 'kırsal / kasaba kökenli',
  small_town: 'küçük kasaba geçmişi',
  suburban: 'banliyö / şehir kenarı',
  urban: 'şehir içi yaşam',
  unknown: 'belirsiz bölge',
};

const LIFESTYLE_TR: Record<CharacterProfile['lifestyle'], string> = {
  practical: 'pratik ve sade yaşam',
  flashy: 'gösterişe açık tarz',
  low_profile: 'dikkat çekmeyen, sade görünüm',
  family: 'aile odaklı hayat',
  criminal: 'riskli çevre',
  professional: 'resmi / düzenli iş hayatı',
  drifter: 'gezgin / plansız yaşam',
  ambitious: 'hedefli ve hırslı',
};

const PURPOSE_TR: Record<NonNullable<CharacterProfile['vehicle_purpose']>, string> = {
  daily_commute: 'günlük işe veya okula gidiş',
  work: 'iş için kullanım',
  equipment_transport: 'malzeme / ekipman taşıma',
  family: 'aile ve ev ihtiyaçları',
  recreation: 'boş zaman / hobi / doğa',
  status: 'görünüm ve statü',
  project: 'garaj / proje / modifiye işleri',
  weekend: 'hafta sonu kullanımı',
};

const CLASS_TR: Record<string, string> = {
  compact: 'kompakt ve ekonomik',
  sedan: 'günlük kullanıma uygun sedan',
  suv: 'geniş ve konforlu SUV',
  pickup: 'yükleme için pickup',
  van: 'hacimli van / minivan',
  offroad: 'arazi ve zor yol koşullarına uygun',
  muscle: 'güçlü ve karakterli kas',
  sports: 'sportif sürüş',
  motorcycle: 'motosiklet',
  bmx: 'bisiklet (ehliyetsiz / genç profil)',
};

function unique(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = item.toLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function buildStorySignals(profile: CharacterProfile): string[] {
  const signals: string[] = [];

  if (profile.age !== undefined) {
    signals.push(`${profile.age} yaş`);
  }

  if (profile.career_stage && CAREER_TR[profile.career_stage]) {
    signals.push(CAREER_TR[profile.career_stage]);
  } else if (profile.life_stage && LIFE_STAGE_TR[profile.life_stage]) {
    signals.push(LIFE_STAGE_TR[profile.life_stage]);
  }

  if (INCOME_TR[profile.income_level]) {
    signals.push(INCOME_TR[profile.income_level]);
  }

  if (profile.financial_pressure === 'high') {
    signals.push('sıkı bütçe baskısı');
  } else if (profile.financial_pressure === 'medium') {
    signals.push('orta düzey mali baskı');
  }

  if (profile.family_support === 'none' || profile.family_support === 'limited') {
    signals.push('sınırlı aile desteği');
  } else if (profile.family_support === 'wealthy') {
    signals.push('güçlü aile desteği');
  }

  if (ORIGIN_TR[profile.origin] && profile.origin !== 'unknown') {
    signals.push(ORIGIN_TR[profile.origin]);
  }

  if (JOB_TR[profile.job_type]) {
    signals.push(JOB_TR[profile.job_type]);
  }

  if (LIFESTYLE_TR[profile.lifestyle]) {
    signals.push(LIFESTYLE_TR[profile.lifestyle]);
  }

  if (profile.vehicle_purpose && PURPOSE_TR[profile.vehicle_purpose]) {
    signals.push(`araç ihtiyacı: ${PURPOSE_TR[profile.vehicle_purpose]}`);
  }

  const need = profile.vehicle_need?.trim();
  if (need && need.length >= 8 && need.length <= 90) {
    signals.push(`hikayedeki ihtiyaç: ${need}`);
  }

  return unique(signals).slice(0, 5);
}

function buildVehicleFitReasons(profile: CharacterProfile, vehicle: VehicleEntry): string[] {
  const reasons: string[] = [];
  const purposes = profile.vehicle_purpose ? [profile.vehicle_purpose] : [];

  if (purposes.includes('equipment_transport') || purposes.includes('work')) {
    if (['pickup', 'van', 'offroad'].includes(vehicle.class)) {
      reasons.push('iş veya malzeme taşıma ihtiyacına uygun kasa tipi');
    }
  }

  if (purposes.includes('daily_commute') || profile.life_stage === 'first_vehicle') {
    if (['compact', 'sedan'].includes(vehicle.class)) {
      reasons.push('günlük kullanım ve ilk araç için pratik');
    }
  }

  if (purposes.includes('family') && ['suv', 'van', 'sedan'].includes(vehicle.class)) {
    reasons.push('aile ve eşya ihtiyaçları için yeterli alan');
  }

  if (profile.income_level === 'low' || profile.income_level === 'lower_mid') {
    if (vehicle.price_tier === 'low' || vehicle.price_tier === 'budget') {
      reasons.push('hikayedeki gelir seviyesini zorlamayan uygun fiyat');
    }
  }

  if (profile.lifestyle === 'low_profile' && vehicle.attention_level <= 3) {
    reasons.push('dikkat çekmeyen, sade bir görünüm');
  }

  if (profile.origin === 'rural' || profile.origin === 'small_town') {
    if (['pickup', 'offroad', 'suv'].includes(vehicle.class)) {
      reasons.push('kırsal veya kasaba geçmişine uygun dayanıklılık');
    }
  }

  if (profile.age !== undefined && profile.age < 18 && vehicle.class === 'bmx') {
    reasons.push('yaş ve ehliyet durumuna uygun seçenek');
  }

  if (CLASS_TR[vehicle.class]) {
    reasons.push(`${CLASS_TR[vehicle.class]} bir başlangıç aracı`);
  }

  if (vehicle.description) {
    const short = vehicle.description.length > 70
      ? `${vehicle.description.slice(0, 67)}...`
      : vehicle.description;
    reasons.push(short);
  }

  return unique(reasons).slice(0, 3);
}

/** Oyuncuya gosterilecek net, Turkce gerekce (STAGE /aracal). */
export function buildStagePlayerReason(profile: CharacterProfile, vehicle: VehicleEntry): string {
  const storySignals = buildStorySignals(profile);
  const fitReasons = buildVehicleFitReasons(profile, vehicle);

  const storyLine = storySignals.length > 0
    ? `Hikayenizden: ${storySignals.join(', ')}.`
    : 'Hikayenizdeki yaşam tarzı, gelir ve kullanım ihtiyacı değerlendirildi.';

  const fitLine = fitReasons.length > 0
    ? `Bu aracı seçmemizin nedeni: ${fitReasons.join('; ')}.`
    : `${vehicle.label}, karakter profilinize en uygun başlangıç aracı olarak öne çıktı.`;

  return `${storyLine}\n${fitLine}`;
}
