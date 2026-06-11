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
  police: ['police', 'sheriff', 'security', 'law_enforcement'],
  criminal: ['criminal', 'criminal_low_profile'],
  worker: ['worker', 'blue_collar'],
  business: ['business', 'white_collar'],
  mechanic: ['mechanic'],
  unemployed: ['unemployed', 'civilian'],
  civilian: ['civilian', 'worker', 'unemployed'],
  other: ['civilian', 'worker'],
};

function overlapCount(a: string[], b: string[]): number {
  const setB = new Set(b.map((x) => x.toLowerCase()));
  return a.filter((x) => setB.has(x.toLowerCase())).length;
}

function buildReason(profile: CharacterProfile, vehicle: VehicleEntry, score: number): string {
  const shared = profile.dominant_vibes.filter((v) =>
    vehicle.vibes.some((vv) => vv.toLowerCase() === v.toLowerCase()),
  );
  const vibeText = shared.length > 0 ? shared.join(', ') : profile.lifestyle;
  return `${vehicle.label}: ${vibeText} profiline uyum (${Math.round(score)} puan). ${vehicle.class} / ${vehicle.price_tier} segment.`;
}

export function scoreVehicle(profile: CharacterProfile, vehicle: VehicleEntry): number {
  let score = 0;

  const vibeOverlap = overlapCount(profile.dominant_vibes, vehicle.vibes);
  score += vibeOverlap * 40;

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

  if (profile.lifestyle === 'low_profile' && vehicle.attention_level >= 5) {
    score -= 15;
  }
  if (profile.lifestyle === 'flashy' && vehicle.flashiness <= 2) {
    score -= 10;
  }

  return Math.max(0, Math.min(100, score));
}

export function rankVehicles(profile: CharacterProfile, limit = 5): ScoredVehicle[] {
  const { vehicles } = loadVehicleCatalog();
  const scored = vehicles
    .map((vehicle) => {
      const score = scoreVehicle(profile, vehicle);
      return {
        vehicle: vehicle.model,
        label: vehicle.label,
        score: Math.round(score),
        reason: buildReason(profile, vehicle, score),
      };
    })
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit);
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
