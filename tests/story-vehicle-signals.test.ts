import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadVehicleCatalog, rankVehicles } from '../src/services/scorer.js';
import {
  extractStoryVehicleSignals,
  storySignalScore,
} from '../src/services/story-vehicle-signals.js';
import type { CharacterProfile } from '../src/types.js';

function profile(overrides: Partial<CharacterProfile>): CharacterProfile {
  return {
    income_level: 'mid',
    origin: 'urban',
    age_group: 'adult',
    job_type: 'civilian',
    lifestyle: 'practical',
    flashiness: 3,
    vehicle_need: 'daily',
    dominant_vibes: ['urban'],
    ...overrides,
  };
}

describe('story-vehicle-signals', () => {
  const catalog = loadVehicleCatalog();

  it('sedan yazan hikayede sedan onceliklidir', () => {
    const story = 'Karakterim sehir icinde yasiyor ve sedan tarzi sade bir arac istiyor.';
    const signals = extractStoryVehicleSignals(story, catalog);
    assert.ok(signals.explicitBodyTypes.includes('sedan'));

    const ranked = rankVehicles(profile({
      origin: 'rural',
      vehicle_need: 'gunluk ulasim',
      dominant_vibes: ['family', 'outdoor'],
    }), 3, signals);

    const topClass = catalog.vehicles.find((v) => v.model === ranked[0].vehicle)?.class;
    assert.equal(topClass, 'sedan');
  });

  it('bisiklet yazan hikayede bmx verilir', () => {
    const story = 'Ehliyeti yok, okula bisiklet ile gidiyor, BMX yeterli.';
    const signals = extractStoryVehicleSignals(story, catalog);
    assert.equal(signals.forceBicycle, true);

    const ranked = rankVehicles(profile({
      age: 17,
      vehicle_need: 'okula bisiklet',
    }), 1, signals);

    assert.equal(ranked[0].vehicle, 'bmx');
  });

  it('hikayede gecen model adi direkt verilmez, ayni tipten baska arac secilir', () => {
    const story = 'Babasindan kalan Emperor sedan gibi bir arac hayal ediyor ama ilk arac daha kucuk olmali.';
    const signals = extractStoryVehicleSignals(story, catalog);
    assert.ok(signals.mentionedModels.has('emperor'));

    const emperorScore = storySignalScore(signals, catalog.vehicles.find((v) => v.model === 'emperor')!, catalog);
    const premierScore = storySignalScore(signals, catalog.vehicles.find((v) => v.model === 'premier')!, catalog);
    assert.ok(emperorScore < premierScore);
  });
});
