import { createHash, randomUUID } from 'node:crypto';
import { analyzeStoryWithGemini } from './gemini.js';
import { analyzeStoryFallback } from './openai.js';
import { getCache } from './fivem.js';
import { loadVehicleCatalog, mergeRecommendations, needsManualReview, rankVehicles } from './scorer.js';
import type { AiAnalysis, PendingRequest, ScoredVehicle } from '../types.js';

export function hashStory(story: string): string {
  return createHash('sha256').update(story.trim()).digest('hex');
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
  try {
    analysis = await analyzeStoryWithGemini(params.story);
  } catch {
    analysis = await analyzeStoryFallback(params.story);
  }

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
