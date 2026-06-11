import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadVehicleCatalog, rankVehicles } from '../src/services/scorer.js';
import type { CharacterProfile } from '../src/types.js';

loadVehicleCatalog();

function profile(overrides: Partial<CharacterProfile> & Pick<CharacterProfile, 'dominant_vibes' | 'job_type'>): CharacterProfile {
  return {
    income_level: 'mid',
    origin: 'urban',
    age_group: 'adult',
    job_type: overrides.job_type,
    lifestyle: 'practical',
    flashiness: 3,
    vehicle_need: 'daily',
    dominant_vibes: overrides.dominant_vibes,
    personality: overrides.personality ?? ['calm'],
    ...overrides,
  };
}

const SCENARIOS: { name: string; profile: CharacterProfile; forbiddenTop?: string[] }[] = [
  {
    name: 'Fakir kasabali karakter',
    profile: profile({
      income_level: 'low',
      origin: 'small_town',
      job_type: 'civilian',
      lifestyle: 'low_profile',
      flashiness: 1,
      dominant_vibes: ['poor_background', 'small_town', 'low_profile', 'modest'],
    }),
    forbiddenTop: ['comet2', 'schafter2', 'tailgater2'],
  },
  {
    name: 'Genc sehirli polis',
    profile: profile({
      income_level: 'upper_mid',
      origin: 'urban',
      age_group: 'young',
      job_type: 'police',
      lifestyle: 'professional',
      flashiness: 5,
      dominant_vibes: ['urban', 'modern', 'ambitious', 'law_enforcement'],
    }),
  },
  {
    name: 'Kirsal sheriff',
    profile: profile({
      income_level: 'mid',
      origin: 'rural',
      job_type: 'police',
      dominant_vibes: ['rural', 'tough', 'law_enforcement', 'practical'],
    }),
  },
  {
    name: 'Tamirci',
    profile: profile({
      job_type: 'mechanic',
      dominant_vibes: ['mechanic', 'blue_collar', 'worker', 'practical'],
    }),
  },
  {
    name: 'Dusuk profilli suclu',
    profile: profile({
      income_level: 'lower_mid',
      job_type: 'criminal',
      lifestyle: 'low_profile',
      flashiness: 2,
      dominant_vibes: ['criminal_low_profile', 'street', 'low_profile'],
    }),
    forbiddenTop: ['comet2', 'buffalo'],
  },
  {
    name: 'Gosterisci suclu',
    profile: profile({
      job_type: 'criminal',
      lifestyle: 'flashy',
      flashiness: 7,
      dominant_vibes: ['flashy', 'rebellious', 'street'],
    }),
  },
  {
    name: 'Zengin is insani',
    profile: profile({
      income_level: 'high',
      job_type: 'business',
      lifestyle: 'professional',
      flashiness: 6,
      dominant_vibes: ['white_collar', 'elegant', 'rich_background'],
    }),
  },
  {
    name: 'Aile babasi',
    profile: profile({
      job_type: 'civilian',
      lifestyle: 'family',
      dominant_vibes: ['family_man', 'practical', 'suburban'],
    }),
  },
  {
    name: 'Gocmen isci',
    profile: profile({
      income_level: 'low',
      job_type: 'worker',
      dominant_vibes: ['worker', 'urban', 'poor_background', 'practical'],
    }),
  },
  {
    name: 'Lambo isteyen fakir hikaye (abuse)',
    profile: profile({
      income_level: 'low',
      origin: 'rural',
      job_type: 'unemployed',
      flashiness: 1,
      dominant_vibes: ['poor_background', 'rural', 'drifter'],
    }),
    forbiddenTop: ['comet2', 'schafter2', 'dominator'],
  },
];

describe('RP senaryolari', () => {
  for (const scenario of SCENARIOS) {
    it(`${scenario.name} — gecerli top-3 uretir`, () => {
      const top = rankVehicles(scenario.profile, 3);
      assert.equal(top.length, 3);
      if (scenario.forbiddenTop) {
        assert.ok(!scenario.forbiddenTop.includes(top[0].vehicle), `${top[0].vehicle} uygun degil`);
      }
    });
  }

  it('Iki polis profili farkli top-1', () => {
    const rural = SCENARIOS.find((s) => s.name === 'Kirsal sheriff')!.profile;
    const urban = SCENARIOS.find((s) => s.name === 'Genc sehirli polis')!.profile;
    const a = rankVehicles(rural, 1)[0].vehicle;
    const b = rankVehicles(urban, 1)[0].vehicle;
    assert.notEqual(a, b);
  });
});

describe('Abuse onlemleri (skor katmani)', () => {
  it('Whitelist disi model skorlanamaz', () => {
    const catalog = loadVehicleCatalog();
    const models = new Set(catalog.vehicles.map((v) => v.model));
    const top = rankVehicles(SCENARIOS[0].profile, 5);
    for (const item of top) {
      assert.ok(models.has(item.vehicle));
    }
  });
});
