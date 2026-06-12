import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadVehicleCatalog, rankVehicles, scoreVehicle } from '../src/services/scorer.js';
import type { CharacterProfile } from '../src/types.js';

loadVehicleCatalog();

const ruralPolice: CharacterProfile = {
  income_level: 'mid',
  origin: 'rural',
  age_group: 'adult',
  job_type: 'police',
  lifestyle: 'practical',
  flashiness: 2,
  vehicle_need: 'daily_and_duty_compatible',
  dominant_vibes: ['small_town', 'disciplined', 'practical', 'low_profile'],
  personality: ['disciplined', 'calm'],
};

const urbanPolice: CharacterProfile = {
  income_level: 'upper_mid',
  origin: 'urban',
  age_group: 'young',
  job_type: 'police',
  lifestyle: 'ambitious',
  flashiness: 5,
  vehicle_need: 'status',
  dominant_vibes: ['urban', 'modern', 'ambitious', 'disciplined'],
  personality: ['ambitious', 'modern'],
};

const ethanCole: CharacterProfile = {
  income_level: 'mid',
  origin: 'rural',
  age_group: 'adult',
  job_type: 'police',
  lifestyle: 'professional',
  flashiness: 3,
  vehicle_need: 'suv - kamp, balik, Blaine County yolculuklari, pratik sivil arac',
  dominant_vibes: ['rural', 'law_enforcement', 'practical', 'disciplined', 'low_profile'],
  personality: ['disciplined', 'calm', 'serious'],
};

describe('scoreVehicle', () => {
  it('whitelist araclari skorlar', () => {
    const catalog = loadVehicleCatalog();
    const granger = catalog.vehicles.find((v) => v.model === 'granger')!;
    const score = scoreVehicle(ruralPolice, granger);
    assert.ok(score > 50);
  });

  it('bad_fit dusuk skor uretir', () => {
    const catalog = loadVehicleCatalog();
    const comet = catalog.vehicles.find((v) => v.model === 'comet2')!;
    const score = scoreVehicle(ruralPolice, comet);
    assert.ok(score < scoreVehicle(ruralPolice, catalog.vehicles.find((v) => v.model === 'granger')!));
  });
});

describe('rankVehicles', () => {
  it('kirsal polis SUV hikayesinde sedan yerine SUV onceliklidir', () => {
    const top = rankVehicles(ethanCole, 3);
    const topModel = top[0].vehicle;
    const catalog = loadVehicleCatalog();
    const topClass = catalog.vehicles.find((v) => v.model === topModel)?.class;
    assert.ok(
      topClass === 'suv' || topClass === 'pickup',
      `Beklenen SUV/pickup, alinan: ${topModel} (${topClass})`,
    );
    assert.notEqual(topModel, 'stanier');
  });

  it('ayni meslek farkli profiller farkli top-1 arac', () => {
    const ruralTop = rankVehicles(ruralPolice, 1)[0].vehicle;
    const urbanTop = rankVehicles(urbanPolice, 1)[0].vehicle;
    assert.notEqual(ruralTop, urbanTop);
  });

  it('her zaman 1-100 arasi skor doner', () => {
    const ranked = rankVehicles(ruralPolice, 5);
    assert.equal(ranked.length, 5);
    for (const item of ranked) {
      assert.ok(item.score >= 0 && item.score <= 100);
      assert.ok(item.reason.length > 10);
    }
  });
});
