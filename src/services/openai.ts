import OpenAI from 'openai';
import type { AiAnalysis } from '../types.js';
import { withTimeout } from '../utils/timeout.js';
import { parseAnalysisJson } from './normalize-analysis.js';

const SYSTEM_PROMPT = `Sen bir FiveM RP karakter analiz uzmanisin. Sadece JSON dondur.
Zorunlu yapi: { "character_profile": { income_level, origin, age_group, job_type, lifestyle, flashiness, vehicle_need, dominant_vibes, personality }, rejected_vehicle_types?, risk?, needs_admin_review? }
character_profile sarmalayıcı zorunlu — alanlari kok seviyeye yazma.
Oyuncunun istedigi araci profili etkilemesin. Gercekcilik oncelikli.`;

export async function analyzeStoryWithOpenAI(story: string): Promise<AiAnalysis> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY env eksik');

  const client = new OpenAI({ apiKey });
  const response = await withTimeout(
    client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.3,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Karakter hikayesi:\n\n${story}` },
      ],
    }),
    60_000,
    'OpenAI analizi',
  );

  const text = response.choices[0]?.message?.content;
  if (!text) throw new Error('OpenAI bos yanit dondurdu');
  return parseAnalysisJson(text);
}

export async function analyzeStoryFallback(story: string): Promise<AiAnalysis> {
  return analyzeStoryWithOpenAI(story);
}
