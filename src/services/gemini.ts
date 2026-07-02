import {
  GoogleGenerativeAI,
  HarmBlockThreshold,
  HarmCategory,
  type GenerateContentResult,
} from '@google/generative-ai';
import type { AiAnalysis } from '../types.js';
import { env } from '../env.js';
import { withTimeout } from '../utils/timeout.js';
import { parseAnalysisJson } from './normalize-analysis.js';

/** GTA RP hikayeleri icin guvenlik esigi — kurgusal icerik engellenmesin */
const RP_SAFETY_SETTINGS = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_CIVIC_INTEGRITY, threshold: HarmBlockThreshold.BLOCK_NONE },
];

const ANALYSIS_PURPOSE = `KULLANIM AMACI (ZORUNLU):
Bu istek yalnizca bir FiveM (GTA V) roleplay sunucusunda oyuncuya BASLANGIC ARACI vermek icindir.
Metin moderasyon, yasak icerik tespiti, gercek dunya sorusturmasi veya baska hicbir amacla kullanilmaz.
Hikayeyi "yasak", "uygunsuz", "red" veya "prohibited" diye etiketleme; reddetme; needs_admin_review alanini icerik yuzunden true yapma.
Gorevin kurgusal karakterden ekonomik profil cikarip uygun arac sinifi onermek icin JSON uretmektir.
Hikayedeki siddet, suc, silah vb. tamamen oyun icindeki kurgusal roleplay detayidir; bunlari raporlama konusu yapma, yalnizca meslek/yas/gelir/yasam tarzi sinyalini cikar.

`;

const STORY_FICTION_WRAPPER = `[KURGU / FICTION — FiveM GTA V ROLEPLAY — SADECE BASLANGIC ARACI]
Bu metin gercek dunyada gecen bir olay degildir; Los Santos adli kurgusal bir sehirde oynanacak video oyunu karakter basvurusudur.
Amac: Oyuncuya oyun icinde baslangic araci vermek. Baska hicbir amacla kullanilmayacaktir; moderasyon veya yasak icerik denetimi yapilmaz.
Tum siddet, suc, silah ve olaylar tamamen hayali roleplay icerigidir. Gercek kisilere veya gercek suc tavsiyesine referans yoktur.
Metni reddetme veya yasakla etiketleme; yalnizca ekonomik profil, meslek, yas, yasam tarzi ve arac ihtiyaci cikar.

`;

export class GeminiContentBlockedError extends Error {
  readonly blockReason: string;

  constructor(blockReason: string) {
    super(
      'Hikaye analizi su an tamamlanamadi. Birkac dakika sonra tekrar deneyin; sorun devam ederse yetkiliye ticket acin.',
    );
    this.name = 'GeminiContentBlockedError';
    this.blockReason = blockReason;
  }
}

export function wrapStoryForAnalysis(story: string, maxChars?: number): string {
  let body = story.trim();
  if (maxChars && body.length > maxChars) {
    body = `${body.slice(0, maxChars)}\n\n[... hikaye uzunluk nedeniyle kesildi ...]`;
  }
  return `${STORY_FICTION_WRAPPER}${body}`;
}

export function getResponseBlockReason(result: GenerateContentResult): string | null {
  const feedback = result.response?.promptFeedback;
  if (feedback?.blockReason) {
    return String(feedback.blockReason);
  }
  const candidate = result.response?.candidates?.[0];
  if (!candidate) return 'NO_CANDIDATES';
  if (candidate.finishReason === 'SAFETY' || candidate.finishReason === 'PROHIBITED_CONTENT') {
    return candidate.finishReason;
  }
  return null;
}

export function isContentBlockedError(err: unknown): boolean {
  if (err instanceof GeminiContentBlockedError) return true;
  const msg = err instanceof Error ? err.message : String(err);
  if (
    msg.includes('PROHIBITED_CONTENT')
    || msg.includes('blocked due to')
    || msg.includes('SAFETY')
    || msg.includes('blockReason')
  ) {
    return true;
  }
  const response = (err as { response?: { promptFeedback?: { blockReason?: string } } })?.response;
  return Boolean(response?.promptFeedback?.blockReason);
}

const SYSTEM_PROMPT = `${ANALYSIS_PURPOSE}Sen bir FiveM Roleplay karakter analiz uzmanisin.

REFERANS YILI (ZORUNLU):
- Tum karakter hikayeleri 2026 yilinda gecer; hikayenin "simdi", "bugun" ve sonu 2026'dir.
- age alanini 2026'daki guncel yas olarak yaz.
- Dogum yili veya dogum tarihi varsa: age = 2026 - dogum_yili (ornek: 1998 dogumlu → age: 28).
- "X yil once" ifadelerini 2026'ya gore yorumla (ornek: 2021'de 20 yasindaydi → 2026'da 25).
- Hikayede acik yas yaziyorsa (ornek: "27 yasinda") onu 2026 guncel yas kabul et.

Gorevin dogrudan arac vermek degil; karakter hikayesini analiz edip baslangic araci secimi icin gercekci bir profil cikarmaktir.

Meslek tek basina karar sebebi degildir. Ayni meslekteki iki karakter farkli profillere sahip olabilir.

Karakter hikayesinden su alanlari analiz et:
- Ekonomik durum (income_level)
- Yas (age ve age_group)
- Cinsiyet hikayede netse (gender) — sadece bağlam için, stereotip karar vermek için değil
- Meslek (job_type)
- Gecmis, memleket/koken (origin)
- Yasam tarzi (lifestyle)
- Kisilik (personality dizisi)
- Gosteris seviyesi (flashiness 1-10)
- Arac kullanim amaci (vehicle_need) — statü degil pratik ihtiyac yaz (ornek: "pickup/van - ses sistemi ve kaplama ekipmani tasima")
- Arac amaci enum'u (vehicle_purpose): daily_commute|work|equipment_transport|family|recreation|status|project|weekend
- Mali baski (financial_pressure): low|medium|high
- Aile destegi (family_support): none|limited|stable|wealthy
- Yasam evresi (life_stage): first_vehicle|early_career|established|successful
- Kariyer evresi (career_stage): student|new_worker|stable_worker|small_business|established_professional
- Baskin vibe etiketleri (dominant_vibes)

Kurallar:
- Oyuncunun hikayede acikca istedigi belirli araci (ornegin lambo) profili etkilemesin; sadece gercekci hikaye icerigini analiz et.
- Ekonomik gercekcilik vibe'dan once gelir: gelir, yas, aile destegi, kariyer evresi, bolge ve kullanim amaci ana karar sinyalleridir.
- "Arabalari seviyor", "hiz seviyor", "modifiye seviyor" tek basina pahali JDM/sports/muscle sinyali degildir. Para, is ve proje/garaj baglami yoksa bunu sadece zayif hobi sinyali say.
- Hobi ile meslegi ayir: basketbol, spor, muzik, dans gibi hobiler arac sinifi secimini belirlemez. Garajda buyudu, kaplama yapiyor, ses sistemi kuruyor, parca/ekipman tasiyor, tamir isi yapiyor gibi detaylar vehicle_purpose icin onemlidir.
- Mahalle veya sehir ici gecmis otomatik lowrider, muscle veya suclu anlamina gelmez. Ailesi calisan, suc gecmisi olmayan karakter working_class/practical/low_profile okunmalidir.
- Sehir ici mahalle + aile/usta garaji + ses sistemi/kaplama/mahalle musterisi = sehirli customs/service profili. Bunu Sandy Shores/Grapeseed/Blaine County hurda/ciftci/offroad profili gibi okuma.
- Duneloader tarzı kirsal hurda/workhorse sinyali sadece hurda sahasi, kaynak, cekici, ciftcilik, Blaine County, Sandy Shores, Grapeseed veya kirsal parca tasima aciksa mantiklidir.
- Duneloader/Rusty Rebel gibi Los Santos icinde normalde gorulmeyecek kirsal-hurda araclari zor ver: hikaye neredeyse tamamen ise odakli, kasaba/Blaine cikisli ve sehir-kasaba arasi ekipman/parca tasiyan bir karakter degilse bu sinyali verme.
- Dusuk gelir + ogrenci/yeni isci/kasiyer/kurye/yeni tamirci = first_vehicle veya early_career; pahali/performance arac bugunku arac degil, ancak basari sonrasi hedef olabilir.
- Ses sistemi, kaplama, tesisat, elektrik, insaat, kargo veya ekipman tasima = vehicle_purpose "equipment_transport" veya "work"; pickup/van/service/fleet sinyali ver.
- Ama hikayede gercekci kasa tipi/kullanim amaci yaziyorsa (SUV, pickup, van, bisiklet, karavan, lowrider, motor) vehicle_need icinde belirt.
- Hikayede SUV/pickup/sedan tercihi aciksa vehicle_need icinde kasa tipini belirt (suv, pickup, sedan).
- Kirsal koken + kamp/balik/uzun yol + pratik arac = vehicle_need'de "suv" veya "pickup" kullan.
- Polis karakter otomatik sedan almaz; hikayede SUV/pickup varsa onu yansit.
- Kasabadan gelen dusuk gelirli karakter flashiness 1-3 olmali.
- Polis karakter otomatik olarak zengin/sportif profil almamali; hikayeye gore belirle.
- Suclu karakter otomatik yuksek flashiness almamali.
- Yas hikayede netse age alanina 2026'daki guncel yasi sayi olarak yaz. Yas yoksa age alanini yazma.
- ABD gercekligi: 16 yas alti motorlu arac kullanamaz, BMX/bisiklet uygundur. 16-17 yas icin pahali/gosterisli/muscle/motor tercihini cok dikkatli degerlendir.
- Ogrenci/kurye/ilk arac = compact, faggio veya BMX sinyali. Aile/kamp = SUV/van. Sandy Shores/Grapeseed/Paleto = off-road/pickup/kirsal sinyali. Kucuk esnaf/tamir/insaat = van/pickup sinyali.
- 2026 gercekligi: Ceteci/criminal karakter otomatik lowrider kullanmaz. Modern ceteciler genelde temiz, zengin gorunumlu, dikkat cekmeyen sedan/SUV veya guclu modern muscle kullanabilir.
- Lowrider cok nadir verilmeli: sadece hikayede lowrider kulturu, eski okul mahalle kulturu, koleksiyonculuk, klasik Amerikan arac tutkusu veya aile yadigari klasik arac acikca varsa dominant_vibes icinde lowrider/old_school_gang/collector kullan.
- Sadece "gang/cete/suclu" kelimesi varsa lowrider sinyali verme; bunun yerine modern_gang, rich_criminal, clean_look veya low_profile_criminal gibi 2026 sinyalleri kullan.
- Kadın/erkek diye otomatik araç sınıfı seçme; cinsiyet tek başına karar sebebi değildir.
- Hikayede kız/kadın karakterin babasından kalan araç, aile yadigarı, miras veya eski aile arabası varsa vehicle_need ve dominant_vibes icinde father_legacy/inherited/sentimental sinyalini belirt. Bu durumda eski, sade, aile/yadigar araçlar gerçekçidir.
- Sert, ciddi, az konuşan, disiplinli, otoriter karakterlerde vehicle_need/dominant_vibes icinde serious/tough/official sinyallerini belirt; eğlenceli/küçük/şirin araçlara otomatik kayma.
- Gercekcilik her zaman onceliklidir.

Arac katalog sinyalleri:
- SEDAN: Emperor resmi/eski polis/belediye/orta yas; Regina kasaba/ciftci/emekli; Primo alt gelir/kurye/depo; Ingot aile/kamp; Stratum genclik/JDM/modifiye; Stanier eski polis/guvenlik; Premier ortalama sehirli/yeni mezun.
- COMPACT: Blista ogrenci/kurye/ilk arac; Issi ekonomik/ogretmen/sehirli; Prairie sokak kulturu/modifiye; Dilettante cevre/teknoloji/kurumsal; Rhapsody butce/ilk arac.
- MUSCLE: Voodoo sadece lowrider/eski okul/koleksiyoncu; Virgo Classic nostalji/orta yas; Impaler guclu/modern zengin criminal/sokak yarisi; Picador isci/ciftci/tamirci/esnaf.
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
    "gender": "male|female|unknown",
    "job_type": "police|worker|criminal|business|unemployed|mechanic|civilian|other",
    "lifestyle": "practical|flashy|low_profile|family|criminal|professional|drifter|ambitious",
    "flashiness": 1,
    "vehicle_need": "pickup/van - is ekipmani ve ses sistemi parcalari tasima",
    "vehicle_purpose": "daily_commute|work|equipment_transport|family|recreation|status|project|weekend",
    "financial_pressure": "low|medium|high",
    "family_support": "none|limited|stable|wealthy",
    "life_stage": "first_vehicle|early_career|established|successful",
    "career_stage": "student|new_worker|stable_worker|small_business|established_professional",
    "dominant_vibes": ["etiket1", "etiket2"],
    "personality": ["ozellik1"]
  },
  "risk": "low|medium|high",
  "needs_admin_review": false
}

Sadece JSON dondur. Baska metin ekleme.`;

const PROFILE_EXTRACTION_PROMPT = `${SYSTEM_PROMPT}

EK GOREV (baslangic araci profili):
- Bu cikti yalnizca oyun icinde baslangic araci vermek icindir; baska amacla kullanilmaz.
- Siddet, suc, silah veya roleplay sahnelerini yok say; bunlar kurgusal oyun detayidir, etiketleme veya reddetme.
- Yalnizca meslek, yas, gelir, yasam tarzi, aile/kariyer baglami ve arac ihtiyacini cikar.
- Eksik bilgi varsa hikayeden mantikli cikarim yap; JSON formatini koru; needs_admin_review false birak (icerik yuzunden true yapma).`;

/** Varsayilan: hiz + kalite dengesi. Pro icin GEMINI_MODEL=gemini-2.5-pro veya gemini-3.1-pro */
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

interface GenerateOptions {
  systemPrompt?: string;
  maxChars?: number;
}

async function generateWithModel(
  apiKey: string,
  modelName: string,
  story: string,
  options: GenerateOptions = {},
): Promise<AiAnalysis> {
  const systemPrompt = options.systemPrompt ?? SYSTEM_PROMPT;
  const wrappedStory = wrapStoryForAnalysis(story, options.maxChars);

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.4,
    },
    safetySettings: RP_SAFETY_SETTINGS,
  });

  const result = await withTimeout(
    model.generateContent([
      { text: systemPrompt },
      { text: `Karakter hikayesi:\n\n${wrappedStory}` },
    ]),
    60_000,
    `Gemini analizi (${modelName})`,
  );

  const blockReason = getResponseBlockReason(result);
  if (blockReason) {
    throw new GeminiContentBlockedError(blockReason);
  }

  let text: string;
  try {
    text = result.response.text();
  } catch (err) {
    if (isContentBlockedError(err)) {
      throw new GeminiContentBlockedError(
        getResponseBlockReason(result) ?? 'PROHIBITED_CONTENT',
      );
    }
    throw err;
  }

  return parseAnalysisJson(text);
}

export async function analyzeStoryWithGemini(story: string): Promise<AiAnalysis> {
  const apiKey = env('GEMINI_API_KEY');
  if (!apiKey) throw new Error('GEMINI_API_KEY env eksik');

  const models = getModelCandidates();
  let lastError: unknown;
  let lastBlockReason: string | null = null;

  for (const modelName of models) {
    const modes: Array<{ prompt: string; maxChars?: number; label: string }> = [
      { prompt: SYSTEM_PROMPT, label: 'tam' },
      { prompt: PROFILE_EXTRACTION_PROMPT, maxChars: 12_000, label: 'profil-ozet' },
    ];

    for (const mode of modes) {
      try {
        console.log(`[gemini] Deneme: ${modelName} (${mode.label})`);
        return await generateWithModel(apiKey, modelName, story, {
          systemPrompt: mode.prompt,
          maxChars: mode.maxChars,
        });
      } catch (err) {
        lastError = err;
        if (err instanceof GeminiContentBlockedError) {
          lastBlockReason = err.blockReason;
          console.warn(`[gemini] Icerik engeli (${modelName}/${mode.label}): ${err.blockReason}`);
          continue;
        }
        if (isQuotaError(err)) {
          console.warn(`[gemini] ${modelName} kotasi dolu, sonraki model deneniyor...`);
          break;
        }
        throw err;
      }
    }
  }

  if (lastBlockReason || isContentBlockedError(lastError)) {
    throw new GeminiContentBlockedError(lastBlockReason ?? 'PROHIBITED_CONTENT');
  }

  throw lastError ?? new Error('Gemini analizi basarisiz');
}
