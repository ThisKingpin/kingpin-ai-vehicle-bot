import { createHash, randomUUID } from 'node:crypto';
import { analyzeStoryWithGemini } from './gemini.js';
import { analyzeStoryFallback } from './openai.js';
import { getCache } from './fivem.js';
import { loadVehicleCatalog, mergeRecommendations, needsManualReview, rankVehicles } from './scorer.js';
import { env } from '../env.js';
import type { AiAnalysis, PendingRequest, ScoredVehicle } from '../types.js';

export function hashStory(story: string): string {
  return createHash('sha256').update(story.trim()).digest('hex');
}

async function analyzeStory(story: string): Promise<AiAnalysis> {
  const geminiKey = env('GEMINI_API_KEY');
  const openaiKey = env('OPENAI_API_KEY');

  if (!geminiKey && !openaiKey) {
    throw new Error(
      'AI anahtari eksik. Railway Variables\'a GEMINI_API_KEY ekleyin: https://aistudio.google.com/apikey (OPENAI_API_KEY opsiyonel yedek).',
    );
  }

  if (geminiKey) {
    try {
      return await analyzeStoryWithGemini(story);
    } catch (geminiErr) {
      if (!openaiKey) {
        const reason = geminiErr instanceof Error ? geminiErr.message : String(geminiErr);
        throw new Error(
          `Gemini analizi basarisiz: ${reason}. GEMINI_API_KEY degerini kontrol edin veya yedek icin OPENAI_API_KEY ekleyin.`,
        );
      }
      console.warn('[analysis] Gemini basarisiz, OpenAI fallback kullaniliyor:', geminiErr);
    }
  }

  return analyzeStoryFallback(story);
}

export async function runAnalysis(params: {
  discordId: string;
  citizenid: string;
  characterName: string;
  serverName: string;
  story: string;
  forceRefresh?: boolean;
}): Promise<PendingRequest> {
  const catalog = loadVehicleCatalog();
  const storyHash = hashStory(params.story);

  if (!params.forceRefresh) {
    try {
      const cached = await getCache(params.citizenid, storyHash, catalog.version);
      if (cached.success && cached.aiProfileJson && cached.recommendedVehiclesJson) {
        return {
          requestId: cached.requestId,
          grantToken: cached.grantToken,
          citizenid: params.citizenid,
          characterName: params.characterName,
          discordId: params.discordId,
          serverName: params.serverName,
          storyText: params.story,
          storyHash,
          vehiclesVersion: catalog.version,
          analysis: cached.aiProfileJson,
          recommendations: cached.recommendedVehiclesJson,
        };
      }
    } catch {
      // cache miss — devam
    }
  }

  let analysis: AiAnalysis;
  analysis = await analyzeStory(params.story);

  const ranked = mergeRecommendations(analysis, rankVehicles(analysis.character_profile, 5));

  return {
    requestId: randomUUID(),
    grantToken: '',
    citizenid: params.citizenid,
    characterName: params.characterName,
    discordId: params.discordId,
    serverName: params.serverName,
    storyText: params.story,
    storyHash,
    vehiclesVersion: catalog.version,
    analysis,
    recommendations: ranked,
  };
}

export function getReviewFlag(analysis: AiAnalysis, recommendations: ScoredVehicle[]): boolean {
  return needsManualReview(analysis, recommendations);
}
