import { analyzeStoryWithGemini } from '../services/gemini.js';
import { analyzeStoryFallback } from '../services/openai.js';
import {
  diversifyCloseRecommendations,
  loadVehicleCatalog,
  mergeRecommendations,
  rankVehicles,
} from '../services/scorer.js';
import { extractStoryVehicleSignals } from '../services/story-vehicle-signals.js';
import { buildStagePlayerReason } from './player-reason.js';
import { applyStoryAgeContext } from '../services/story-age.js';
import { env } from '../env.js';

export interface StageAnalysisResult {
  vehicle: string;
  vehicleLabel: string;
  analysisReason: string;
}

async function analyzeStory(story: string) {
  const geminiKey = env('GEMINI_API_KEY');
  const openaiKey = env('OPENAI_API_KEY');

  if (geminiKey) {
    try {
      return await analyzeStoryWithGemini(story);
    } catch (e) {
      if (!openaiKey) throw e;
      console.warn('[stage/analyze] Gemini basarisiz, OpenAI fallback:', e);
    }
  }

  if (openaiKey) return analyzeStoryFallback(story);
  throw new Error('AI anahtari eksik: GEMINI_API_KEY veya OPENAI_API_KEY gerekli.');
}

export async function analyzeStoryForStage(
  story: string,
  seed: string,
): Promise<StageAnalysisResult> {
  if (!story.trim()) {
    throw new Error('Hikaye metni bos.');
  }

  const analysis = await analyzeStory(story);
  applyStoryAgeContext(story, analysis.character_profile);
  const catalog = loadVehicleCatalog();
  const storySignals = extractStoryVehicleSignals(story, catalog);
  const ranked = diversifyCloseRecommendations(
    mergeRecommendations(analysis, rankVehicles(analysis.character_profile, 5, storySignals)),
    seed,
  );

  if (!ranked.length) {
    throw new Error('Katalog eslesmesi bulunamadi.');
  }

  const top = ranked[0];
  const vehicleEntry = catalog.vehicles.find((v) => v.model === top.vehicle);
  const analysisReason = vehicleEntry
    ? buildStagePlayerReason(analysis.character_profile, vehicleEntry, storySignals)
    : (top.reason ?? '');

  return {
    vehicle: top.vehicle,
    vehicleLabel: top.label,
    analysisReason,
  };
}
