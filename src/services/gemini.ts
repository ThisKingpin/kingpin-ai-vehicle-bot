import { GoogleGenerativeAI } from '@google/generative-ai';
import type { AiAnalysis } from '../types.js';
import { env } from '../env.js';
import { withTimeout } from '../utils/timeout.js';
import { parseAnalysisJson } from './normalize-analysis.js';

const SYSTEM_PROMPT = `Sen bir FiveM Roleplay karakter analiz uzmanisin.

Gorevin oyuncuya arac vermek degil, karakter hikayesini analiz edip gercekci bir karakter profili cikarmaktir.

Meslek tek basina karar sebebi degildir. Ayni meslekteki iki karakter farkli profillere sahip olabilir.

Karakter hikayesinden su alanlari analiz et:
- Ekonomik durum (income_level)
- Yas (age ve age_group)
- Meslek (job_type)
- Gecmis, memleket/koken (origin)
- Yasam tarzi (lifestyle)
- Kisilik (personality dizisi)
- Gosteris seviyesi (flashiness 1-10)
- Arac kullanim amaci (vehicle_need) — hikayede gecen kasa tipini ve kullanim amacini yaz (ornek: "suv - kamp, kirsal yol, pratik devriye")
- Baskin vibe etiketleri (dominant_vibes)

Kurallar:
- Oyuncunun hikayede acikca istedigi belirli araci (ornegin lambo) profili etkilemesin; sadece gercekci hikaye icerigini analiz et.
- Ama hikayede gercekci kasa tipi/kullanim amaci yaziyorsa (SUV, pickup, van, bisiklet, karavan, lowrider, motor) vehicle_need icinde belirt.
- Hikayede SUV/pickup/sedan tercihi aciksa vehicle_need icinde kasa tipini belirt (suv, pickup, sedan).
- Kirsal koken + kamp/balik/uzun yol + pratik arac = vehicle_need'de "suv" veya "pickup" kullan.
- Polis karakter otomatik sedan almaz; hikayede SUV/pickup varsa onu yansit.
- Kasabadan gelen dusuk gelirli karakter flashiness 1-3 olmali.
- Polis karakter otomatik olarak zengin/sportif profil almamali; hikayeye gore belirle.
- Suclu karakter otomatik yuksek flashiness almamali.
- Yas hikayede netse age alanina sayi olarak yaz. Yas yoksa age alanini yazma.
- ABD gercekligi: 16 yas alti motorlu arac kullanamaz, BMX/bisiklet uygundur. 16-17 yas icin pahali/gosterisli/muscle/motor tercihini cok dikkatli degerlendir.
- Ogrenci/kurye/ilk arac = compact, faggio veya BMX sinyali. Aile/kamp = SUV/van. Sandy Shores/Grapeseed/Paleto = off-road/pickup/kirsal sinyali. Lowrider/mahalle/gang = Voodoo/Virgo sinyali. Kucuk esnaf/tamir/insaat = van/pickup sinyali.
- Gercekcilik her zaman onceliklidir.

Arac katalog sinyalleri:
- SEDAN: Emperor resmi/eski polis/belediye/orta yas; Regina kasaba/ciftci/emekli; Primo alt gelir/kurye/depo; Ingot aile/kamp; Stratum genclik/JDM/modifiye; Stanier eski polis/guvenlik; Premier ortalama sehirli/yeni mezun.
- COMPACT: Blista ogrenci/kurye/ilk arac; Issi ekonomik/ogretmen/sehirli; Prairie sokak kulturu/modifiye; Dilettante cevre/teknoloji/kurumsal; Rhapsody butce/ilk arac.
- MUSCLE: Voodoo lowrider/mahalle/gang; Virgo Classic nostalji/orta yas; Impaler guclu/sokak yarisi; Picador isci/ciftci/tamirci/esnaf.
- SUV: Seminole aile/kamp/doga; BeeJay XL kirsal/av/balik.
- VANS: Surfer sahil/hippi; Speedo kargo/kucuk isletme; Journey karavan/gezgin; Bobcat XL insaat/tesisat/esnaf.
- MOTORCYCLE: Faggio pizza/ogrenci/butce; Manchez dag/kirsal/avci/kacakci.
- OFFROAD: Duneloader hurdaci/madenci/ciftci; Rusty Rebel Sandy Shores/hurdaci/tamirci/col.
- BMX: Cruiser sahil/ogrenci/ehliyetsiz; Fixter bisiklet kulturu/spor/sehir.

ZORUNLU JSON formati (baska alan ekleme, character_profile sarmalayıcı zorunlu):
{
  "character_profile": {
    "income_level": "low|lower_mid|mid|upper_mid|high",
    "origin": "rural|small_town|suburban|urban|unknown",
    "age_group": "young|adult|middle_aged|old",
    "age": 27,
    "job_type": "police|worker|criminal|business|unemployed|mechanic|civilian|other",
    "lifestyle": "practical|flashy|low_profile|family|criminal|professional|drifter|ambitious",
    "flashiness": 1,
    "vehicle_need": "suv - kamp ve kirsal yolculuk",
    "dominant_vibes": ["etiket1", "etiket2"],
    "personality": ["ozellik1"]
  },
  "risk": "low|medium|high",
  "needs_admin_review": false
}

Sadece JSON dondur. Baska metin ekleme.`;

/** gemini-2.0-flash shut down June 2026 — use 2.5+ on free tier */
const DEFAULT_MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'] as const;

function getModelCandidates(): string[] {
  const configured = env('GEMINI_MODEL');
  if (configured) return [configured];
  return [...DEFAULT_MODELS];
}

function isQuotaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED');
}

async function generateWithModel(apiKey: string, modelName: string, story: string): Promise<AiAnalysis> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
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
    `Gemini analizi (${modelName})`,
  );

  const text = result.response.text();
  return parseAnalysisJson(text);
}

export async function analyzeStoryWithGemini(story: string): Promise<AiAnalysis> {
  const apiKey = env('GEMINI_API_KEY');
  if (!apiKey) throw new Error('GEMINI_API_KEY env eksik');

  const models = getModelCandidates();
  let lastError: unknown;

  for (const modelName of models) {
    try {
      console.log(`[gemini] Model deneniyor: ${modelName}`);
      return await generateWithModel(apiKey, modelName, story);
    } catch (err) {
      lastError = err;
      if (isQuotaError(err) && models.indexOf(modelName) < models.length - 1) {
        console.warn(`[gemini] ${modelName} kotasi dolu, sonraki model deneniyor...`);
        continue;
      }
      throw err;
    }
  }

  throw lastError ?? new Error('Gemini analizi basarisiz');
}
