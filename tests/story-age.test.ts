import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  STAGE_REFERENCE_YEAR,
  ageFromBirthYear,
  applyStoryAgeContext,
  extractBirthYearFromStory,
  resolveCharacterAge,
} from '../src/services/story-age.js';
import type { CharacterProfile } from '../src/types.js';

describe('story-age', () => {
  it('2026 referans yili sabit', () => {
    assert.equal(STAGE_REFERENCE_YEAR, 2026);
  });

  it('dogum yilindan yas hesaplar', () => {
    assert.equal(extractBirthYearFromStory('1998 yilinda dogdu, Los Santos\'a geldi.'), 1998);
    assert.equal(ageFromBirthYear(1998), 28);
    assert.equal(resolveCharacterAge('1998 dogumlu karakter', 22), 28);
  });

  it('acik yas ifadesini kullanir', () => {
    assert.equal(resolveCharacterAge('Karakter su an 31 yasinda ve tamirci.', undefined), 31);
  });

  it('applyStoryAgeContext age_group gunceller', () => {
    const profile = {
      income_level: 'mid',
      origin: 'urban',
      age_group: 'young',
      job_type: 'worker',
      lifestyle: 'practical',
      flashiness: 3,
      vehicle_need: 'sedan',
      dominant_vibes: ['urban'],
      age: 22,
    } as CharacterProfile;

    applyStoryAgeContext('2001 dogumlu, sehirde yasiyor.', profile);
    assert.equal(profile.age, 25);
    assert.equal(profile.age_group, 'young');
  });
});
