import { GoogleGenerativeAI, type Part } from '@google/generative-ai';
import { env } from '../env.js';
import type { AiAnalysis, ScoredVehicle } from '../types.js';
import { withTimeout } from '../utils/timeout.js';
import { getVehicleImageUrl } from './vehicle-image.js';

const VISUAL_PROMPT = `Sen bir FiveM RP arac gorunum uyumu denetleyicisisin.

Gorevin karakter profiliyle araclarin GORSEL dili uyumlu mu diye bakmak.
Skorlayicinin yas, ehliyet, whitelist ve hikaye uyumu kararlarini bozma.
Sadece verilen aday araclar arasinda, arac fotografindaki gorunumun karaktere uyumunu karsilastir.

Dikkat edecegin gorsel sinyaller:
- Ciddi/resmi/sert karakter: sade, ciddi, guven veren, fazla oyuncak gibi durmayan arac.
- Low-profile criminal: temiz, sivil, dikkat cekmeyen gorunum.
- Modern zengin criminal: temiz, pahali/guclu ama abarti olmayan gorunum.
- Aile/kamp/kirsal: yuksek, pratik, hacimli veya dayanikli gorunum.
- Koleksiyoncu/old-school: klasik ve eski okul gorunum.

Sadece JSON dondur:
{
  "ranked_models": ["model1", "model2"],
  "notes": "kisa gerekce"
}`;

type VisualRankResult = {
  ranked_models?: unknown;
  notes?: unknown;
};

function shouldSkipVisualAnalysis(): boolean {
  const value = env('VEHICLE_VISUAL_ANALYSIS');
  return value === '0' || value?.toLowerCase() === 'false';
}

async function fetchImagePart(url: string): Promise<Part> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Arac gorseli indirilemedi: ${url} (${response.status})`);
  }

  const mimeType = response.headers.get('content-type')?.split(';')[0] ?? 'image/webp';
  const bytes = Buffer.from(await response.arrayBuffer());

  return {
    inlineData: {
      data: bytes.toString('base64'),
      mimeType,
    },
  };
}

export function parseVisualRankJson(raw: string, allowedModels: string[]): string[] {
  const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
  const parsed = JSON.parse(cleaned) as VisualRankResult;
  if (!Array.isArray(parsed.ranked_models)) return [];

  const allowed = new Set(allowedModels);
  const seen = new Set<string>();
  const ranked: string[] = [];

  for (const item of parsed.ranked_models) {
    if (typeof item !== 'string') continue;
    const model = item.toLowerCase().trim();
    if (!allowed.has(model) || seen.has(model)) continue;
    seen.add(model);
    ranked.push(model);
  }

  return ranked;
}

function reorderRecommendations(recommendations: ScoredVehicle[], visualOrder: string[]): ScoredVehicle[] {
  if (visualOrder.length === 0) return recommendations;
  const byModel = new Map(recommendations.map((item) => [item.vehicle, item]));
  const used = new Set<string>();
  const reordered: ScoredVehicle[] = [];

  for (const model of visualOrder) {
    const item = byModel.get(model);
    if (!item) continue;
    used.add(model);
    reordered.push(item);
  }

  for (const item of recommendations) {
    if (!used.has(item.vehicle)) reordered.push(item);
  }

  return reordered;
}

export async function rerankVehiclesByVisualFit(
  analysis: AiAnalysis,
  recommendations: ScoredVehicle[],
): Promise<ScoredVehicle[]> {
  const apiKey = env('GEMINI_API_KEY');
  if (!apiKey || shouldSkipVisualAnalysis() || recommendations.length < 2) return recommendations;

  const candidates = recommendations.slice(0, Math.min(4, recommendations.length));
  const allowedModels = candidates.map((item) => item.vehicle);

  try {
    const imageParts = await Promise.all(
      candidates.map(async (candidate, index) => {
        const image = await fetchImagePart(getVehicleImageUrl(candidate.vehicle));
        return [
          { text: `ARAC_${index + 1}: ${candidate.label} (${candidate.vehicle}), skor=${candidate.score}, gerekce=${candidate.reason}` },
          image,
        ] satisfies Part[];
      }),
    );

    const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({
      model: env('GEMINI_MODEL') ?? 'gemini-2.5-flash',
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.2,
      },
    });

    const profile = analysis.character_profile;
    const result = await withTimeout(
      model.generateContent([
        { text: VISUAL_PROMPT },
        {
          text:
            `Karakter profili:\n${JSON.stringify(profile, null, 2)}\n\n` +
            `Aday modeller: ${allowedModels.join(', ')}\n` +
            `Sadece bu model isimlerini ranked_models icinde kullan.`,
        },
        ...imageParts.flat(),
      ]),
      45_000,
      'Gorsel arac uyum analizi',
    );

    const visualOrder = parseVisualRankJson(result.response.text(), allowedModels);
    return reorderRecommendations(recommendations, visualOrder);
  } catch (err) {
    console.warn('[visual-vehicle-analysis] Gorsel analiz atlandi:', err);
    return recommendations;
  }
}
