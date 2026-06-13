import OpenAI from 'openai';
import type { AiAnalysis } from '../types.js';
import { withTimeout } from '../utils/timeout.js';
import { parseAnalysisJson } from './normalize-analysis.js';

const SYSTEM_PROMPT = `Sen bir FiveM RP karakter analiz uzmanisin. Sadece JSON dondur.
Zorunlu yapi: { "character_profile": { income_level, origin, age_group, age?, gender?, job_type, lifestyle, flashiness, vehicle_need, vehicle_purpose?, financial_pressure?, family_support?, life_stage?, career_stage?, dominant_vibes, personality }, rejected_vehicle_types?, risk?, needs_admin_review? }
character_profile sarmalayıcı zorunlu — alanlari kok seviyeye yazma.
Oyuncunun istedigi araci profili etkilemesin. Ekonomik gercekcilik vibe'dan once gelir.
"Arabalari seviyor" tek basina pahali JDM/sports/muscle sinyali degildir.
Hobi ile meslegi ayir: basketbol/spor/muzik arac secimini belirlemez; garaj, kaplama, ses sistemi, ekipman tasima ve tamir isi belirler.
South LS/mahalle gecmisi tek basina lowrider/muscle/suclu anlamina gelmez; aile calisan ve suc gecmisi yoksa working_class/practical oku.
Dusuk gelir + ogrenci/yeni isci/kasiyer/kurye/yeni tamirci icin first_vehicle/early_career ve pratik arac sinyali ver.
Ses sistemi, kaplama, tesisat, insaat, kargo veya ekipman tasima varsa vehicle_purpose equipment_transport/work olsun.`;

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
