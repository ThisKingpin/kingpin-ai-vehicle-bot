import { GoogleGenerativeAI } from '@google/generative-ai';
import { AiAnalysisSchema, type AiAnalysis } from '../types.js';
import { withTimeout } from '../utils/timeout.js';

const SYSTEM_PROMPT = `Sen bir FiveM Roleplay karakter analiz uzmanisin.

Gorevin oyuncuya arac vermek degil, karakter hikayesini analiz edip gercekci bir karakter profili cikarmaktir.

Meslek tek basina karar sebebi degildir. Ayni meslekteki iki karakter farkli profillere sahip olabilir.

Karakter hikayesinden su alanlari analiz et:
- Ekonomik durum (income_level)
- Yas (age_group)
- Meslek (job_type)
- Gecmis, memleket/koken (origin)
- Yasam tarzi (lifestyle)
- Kisilik (personality dizisi)
- Gosteris seviyesi (flashiness 1-10)
- Arac kullanim amaci (vehicle_need)
- Baskin vibe etiketleri (dominant_vibes)

Kurallar:
- Oyuncunun hikayede acikca istedigi araci (ornegin lambo) profili etkilemesin; sadece gercekci hikaye icerigini analiz et.
- Kasabadan gelen dusuk gelirli karakter flashiness 1-3 olmali.
- Polis karakter otomatik olarak zengin/sportif profil almamali; hikayeye gore belirle.
- Suclu karakter otomatik yuksek flashiness almamali.
- Gercekcilik her zaman onceliklidir.

Sadece JSON dondur. Baska metin ekleme.`;

export async function analyzeStoryWithGemini(story: string): Promise<AiAnalysis> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY env eksik');

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.4,
    },
  });

  const result = await withTimeout(
    model.generateContent([
      { text: SYSTEM_PROMPT },
      { text: `Karakter hikayesi:\n\n${story}` },
    ]),
    60_000,
    'Gemini analizi',
  );

  const text = result.response.text();
  return parseAnalysisJson(text);
}

function parseAnalysisJson(raw: string): AiAnalysis {
  const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
  const parsed = JSON.parse(cleaned);
  return AiAnalysisSchema.parse(parsed);
}

export { parseAnalysisJson };
