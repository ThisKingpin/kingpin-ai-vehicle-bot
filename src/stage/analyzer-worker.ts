/**
 * STAGE Analiz Worker
 *
 * stage_character_forms tablosundaki analysis_status = 'queued' kayıtlarını
 * alır, mevcut AI + rankVehicles pipeline'ını çalıştırır ve sonucu DB'ye yazar.
 * Mevcut kingpin-ai-vehicles kataloğu ve analiz mantığı korunur.
 */

import type { Pool } from 'mysql2/promise';
import {
  claimQueuedForm,
  markAnalysisDone,
  markAnalysisFailed,
} from './db.js';
import { analyzeStoryWithGemini } from '../services/gemini.js';
import { analyzeStoryFallback } from '../services/openai.js';
import {
  diversifyCloseRecommendations,
  mergeRecommendations,
  rankVehicles,
} from '../services/scorer.js';
import { env } from '../env.js';
import type { AiAnalysis } from '../types.js';

const POLL_INTERVAL_MS = 6_000;   // kuyruk kontrol sıklığı
const FAIL_RETRY_DELAY = 30_000;  // hata sonrası bekleme

async function analyzeStory(story: string): Promise<AiAnalysis> {
  const geminiKey = env('GEMINI_API_KEY');
  const openaiKey = env('OPENAI_API_KEY');

  if (geminiKey) {
    try {
      return await analyzeStoryWithGemini(story);
    } catch (e) {
      if (!openaiKey) throw e;
      console.warn('[stage/analyzer] Gemini başarısız, OpenAI fallback:', e);
    }
  }

  if (openaiKey) return analyzeStoryFallback(story);

  throw new Error('AI anahtarı eksik: GEMINI_API_KEY veya OPENAI_API_KEY gerekli.');
}

async function processOne(pool: Pool): Promise<boolean> {
  const form = await claimQueuedForm(pool);
  if (!form) return false;

  const story = form.story_text ?? '';
  const formId = form.id;

  console.log(`[stage/analyzer] Analiz başlatıldı: form #${formId} (thread: ${form.thread_id}, karakter: ${form.character_name ?? '?'})`);

  try {
    if (!story.trim()) {
      throw new Error('Hikaye metni boş.');
    }

    const analysis = await analyzeStory(story);

    // Mevcut kingpin katalog + scoring pipeline kullanılır
    const ranked = diversifyCloseRecommendations(
      mergeRecommendations(analysis, rankVehicles(analysis.character_profile, 5)),
      `stage:${formId}:${form.thread_id}`,
    );

    if (!ranked.length) {
      throw new Error('Katalog eşleşmesi bulunamadı.');
    }

    const top        = ranked[0];
    const vehicle      = top.vehicle;
    const vehicleLabel = top.label;
    const reason       = top.reason ?? '';

    await markAnalysisDone(pool, formId, vehicle, vehicleLabel, reason);

    console.log(`[stage/analyzer] Analiz tamamlandı: form #${formId} → ${vehicle} (${vehicleLabel})`);
    return true;

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[stage/analyzer] form #${formId} analiz hatası: ${msg}`);
    await markAnalysisFailed(pool, formId).catch(() => {});
    return true; // başka kayıtlara geçmeye devam et
  }
}

export function startAnalyzerWorker(pool: Pool): void {
  let running = false;

  async function tick(): Promise<void> {
    if (running) return;
    running = true;
    try {
      // Kuyruktaki tüm kayıtları tüket
      while (await processOne(pool)) {
        // kısa nefes
        await new Promise((r) => setTimeout(r, 500));
      }
    } catch (err) {
      console.error('[stage/analyzer] Worker döngü hatası:', err);
      await new Promise((r) => setTimeout(r, FAIL_RETRY_DELAY));
    } finally {
      running = false;
    }
  }

  setInterval(tick, POLL_INTERVAL_MS);
  tick(); // başlangıçta da çalıştır

  console.log(`[stage/analyzer] Analiz worker başlatıldı (interval: ${POLL_INTERVAL_MS / 1000}s)`);
}
