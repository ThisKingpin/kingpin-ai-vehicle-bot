import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildStagePlayerReason } from '../src/stage/player-reason.js';
import type { CharacterProfile, VehicleEntry } from '../src/types.js';

const baseProfile: CharacterProfile = {
  income_level: 'low',
  origin: 'urban',
  age_group: 'young',
  age: 22,
  job_type: 'worker',
  lifestyle: 'practical',
  flashiness: 2,
  vehicle_need: 'gunluk ise ve okula gidiş icin ekonomik arac',
  vehicle_purpose: 'daily_commute',
  financial_pressure: 'high',
  family_support: 'limited',
  life_stage: 'first_vehicle',
  career_stage: 'student',
  dominant_vibes: ['student', 'delivery'],
};

const blista: VehicleEntry = {
  model: 'blista',
  label: 'Dinka Blista',
  class: 'compact',
  price_tier: 'budget',
  vibes: ['student', 'daily_driver'],
  fits_jobs: ['student'],
  fits_personality: [],
  bad_fits: [],
  flashiness: 2,
  attention_level: 2,
  realism_score: 8,
  description: 'Sehir ici ilk arac icin ekonomik kompakt.',
};

describe('buildStagePlayerReason', () => {
  it('oyuncu dilinde hikaye sinyalleri ve secim nedeni uretir', () => {
    const reason = buildStagePlayerReason(baseProfile, blista);
    assert.match(reason, /Hikayenizden:/);
    assert.match(reason, /22 yaş/);
    assert.match(reason, /öğrenci/);
    assert.match(reason, /düşük gelir/);
    assert.match(reason, /Bu aracı seçmemizin nedeni:/);
    assert.doesNotMatch(reason, /puan/);
    assert.doesNotMatch(reason, /segment/);
  });
});
