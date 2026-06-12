import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAnalysisPayload, parseAnalysisJson } from '../src/services/normalize-analysis.js';

describe('normalizeAnalysisPayload', () => {
  it('wraps flat profile fields into character_profile', () => {
    const result = normalizeAnalysisPayload({
      income_level: 'low',
      origin: 'small_town',
      age_group: 'young',
      job_type: 'civilian',
      lifestyle: 'practical',
      flashiness: 2,
      vehicle_need: 'work commute',
      dominant_vibes: ['modest'],
      risk: 'low',
    }) as Record<string, unknown>;

    const profile = result.character_profile as Record<string, unknown>;
    assert.equal(profile.income_level, 'low');
    assert.equal(profile.job_type, 'civilian');
    assert.deepEqual(profile.dominant_vibes, ['modest']);
  });

  it('accepts nested profile key', () => {
    const result = normalizeAnalysisPayload({
      profile: {
        income_level: 'mid',
        origin: 'urban',
        age_group: 'adult',
        job_type: 'police',
        lifestyle: 'professional',
        flashiness: 5,
        vehicle_need: 'patrol',
        dominant_vibes: ['law_enforcement', 'urban'],
      },
    }) as Record<string, unknown>;

    const profile = result.character_profile as Record<string, unknown>;
    assert.equal(profile.job_type, 'police');
  });

  it('parses valid wrapped JSON string', () => {
    const parsed = parseAnalysisJson(JSON.stringify({
      character_profile: {
        income_level: 'mid',
        origin: 'urban',
        age_group: 'adult',
        job_type: 'civilian',
        lifestyle: 'practical',
        flashiness: 4,
        vehicle_need: 'daily',
        dominant_vibes: ['practical'],
      },
    }));
    assert.equal(parsed.character_profile.income_level, 'mid');
  });
});
