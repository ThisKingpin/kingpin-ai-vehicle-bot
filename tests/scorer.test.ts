import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadVehicleCatalog, rankVehicles, scoreVehicle } from '../src/services/scorer.js';
import type { CharacterProfile } from '../src/types.js';

loadVehicleCatalog();

function profile(overrides: Partial<CharacterProfile>): CharacterProfile {
  return {
    income_level: 'mid',
    origin: 'urban',
    age_group: 'adult',
    job_type: 'civilian',
    lifestyle: 'practical',
    flashiness: 3,
    vehicle_need: 'daily transport',
    dominant_vibes: ['practical'],
    personality: ['calm'],
    ...overrides,
  };
}

function topClass(profileData: CharacterProfile): string | undefined {
  const catalog = loadVehicleCatalog();
  const top = rankVehicles(profileData, 1)[0].vehicle;
  return catalog.vehicles.find((v) => v.model === top)?.class;
}

describe('scoreVehicle', () => {
  it('whitelist araclari skorlar', () => {
    const catalog = loadVehicleCatalog();
    const seminole = catalog.vehicles.find((v) => v.model === 'seminole')!;
    const score = scoreVehicle(
      profile({
        origin: 'suburban',
        lifestyle: 'family',
        vehicle_need: 'suv - aile ve kamp',
        dominant_vibes: ['family', 'camping', 'outdoor', 'practical'],
      }),
      seminole,
    );
    assert.ok(score > 60);
  });

  it('bad_fit dusuk skor uretir', () => {
    const catalog = loadVehicleCatalog();
    const voodoo = catalog.vehicles.find((v) => v.model === 'voodoo')!;
    const stanier = catalog.vehicles.find((v) => v.model === 'stanier')!;
    const police = profile({
      job_type: 'police',
      lifestyle: 'professional',
      dominant_vibes: ['law_enforcement', 'official', 'disciplined'],
    });
    assert.ok(scoreVehicle(police, voodoo) < scoreVehicle(police, stanier));
  });
});

describe('rankVehicles', () => {
  it('15 yas altina motorlu arac yerine BMX verir', () => {
    const underage = profile({
      age: 15,
      age_group: 'young',
      vehicle_need: 'okula gidip gelmek icin ehliyetsiz ulasim',
      dominant_vibes: ['student', 'no_license', 'budget'],
    });
    assert.equal(topClass(underage), 'bmx');
  });

  it('universite/kurye/ilk arac profilinde compact onceliklidir', () => {
    const studentCourier = profile({
      age: 19,
      age_group: 'young',
      job_type: 'worker',
      income_level: 'low',
      vehicle_need: 'ilk arac, kurye isi, sehir ici ekonomik ulasim',
      dominant_vibes: ['student', 'delivery', 'starter_car', 'budget'],
      personality: ['young', 'practical'],
    });
    assert.equal(topClass(studentCourier), 'compact');
  });

  it('Sandy Shores ciftci/tamirci profilinde offroad veya is araci onceliklidir', () => {
    const sandyWorker = profile({
      origin: 'rural',
      job_type: 'mechanic',
      income_level: 'lower_mid',
      vehicle_need: 'Sandy Shores tamirci, hurda ve arazi yollari',
      dominant_vibes: ['sandy_shores', 'mechanic', 'rural', 'scrapper'],
      personality: ['tough', 'practical'],
    });
    const vehicleClass = topClass(sandyWorker);
    assert.ok(vehicleClass === 'offroad' || vehicleClass === 'van' || vehicleClass === 'muscle');
  });

  it('aile/kamp hikayesinde SUV veya van onceliklidir', () => {
    const familyCamper = profile({
      lifestyle: 'family',
      vehicle_need: 'aile, hafta sonu kamp, sehir disi yolculuk',
      dominant_vibes: ['family', 'camping', 'outdoor', 'suburban'],
      personality: ['mature', 'practical'],
    });
    const vehicleClass = topClass(familyCamper);
    assert.ok(vehicleClass === 'suv' || vehicleClass === 'van');
  });

  it('lowrider/gang hikayesinde Voodoo veya Virgo Classic onceliklidir', () => {
    const lowriderGang = profile({
      job_type: 'criminal',
      lifestyle: 'criminal',
      vehicle_need: 'mahalle lowrider kulturu ve eski okul cruiser',
      dominant_vibes: ['lowrider', 'gang', 'neighborhood', 'old_school'],
      personality: ['street_smart', 'proud'],
    });
    const top = rankVehicles(lowriderGang, 2).map((r) => r.vehicle);
    assert.ok(top.includes('voodoo') || top.includes('virgo2'));
  });

  it('polis/belediye/orta yas profilinde resmi sedan onceliklidir', () => {
    const official = profile({
      age: 42,
      age_group: 'middle_aged',
      job_type: 'police',
      lifestyle: 'professional',
      vehicle_need: 'eski polis, belediye ve guvenlik isleri icin resmi sedan',
      dominant_vibes: ['law_enforcement', 'official', 'disciplined', 'low_profile'],
      personality: ['mature', 'serious'],
    });
    const top = rankVehicles(official, 3).map((r) => r.vehicle);
    assert.ok(top.includes('stanier') || top.includes('emperor'));
  });

  it('her zaman 1-100 arasi skor doner', () => {
    const ranked = rankVehicles(profile({ dominant_vibes: ['practical', 'worker'] }), 5);
    assert.equal(ranked.length, 5);
    for (const item of ranked) {
      assert.ok(item.score >= 0 && item.score <= 100);
      assert.ok(item.reason.length > 10);
    }
  });
});
