/**
 * STAGE Forum İçe Aktarıcı
 *
 * Discord karakterler forum kanalındaki thread'leri okur ve
 * stage_character_forms tablosuna kaydeder.
 *
 * - Başlangıçta mevcut aktif + arşiv thread'leri içe aktarır.
 * - threadCreate eventi ile yeni thread'leri canlı yakalar.
 */

import {
  ChannelType,
  type Client,
  type Message,
  type ThreadChannel,
} from 'discord.js';
import type { Pool } from 'mysql2/promise';
import { insertForm, threadExists } from './db.js';
import { fetchStoryAttachmentText } from '../services/attachment-text.js';
import { env } from '../env.js';

// ─── Karakter adı çıkarma kalıpları ─────────────────────────────────────────

const NAME_PATTERNS = [
  /karakter\s*ad[ıi]\s*soyad[ıi]\s*[:：]\s*([^\n]+)/i,
  /karakter\s*ad[ıi]\s*[:：]\s*([^\n]+)/i,
  /isim\s*(?:soyad[ıi])?\s*[:：]\s*([^\n]+)/i,
  /ad\s*soyad\s*[:：]\s*([^\n]+)/i,
  /character\s*name\s*[:：]\s*([^\n]+)/i,
  /\*\*\s*karakter\s*ad[ıi]\s*[:：]\s*\*\*\s*([^\n]+)/i,
  /\*\*ad(?:\s*soyad)?\*\*\s*[:：]\s*([^\n]+)/i,
];

const STORY_MAX = Number(env('STORY_MAX') ?? '20000');

function extractCharacterName(text: string, title: string): string | null {
  for (const pat of NAME_PATTERNS) {
    const m = text.match(pat);
    if (m) {
      const name = m[1].replace(/\*+/g, '').trim().split('\n')[0].trim();
      if (name.length >= 2 && name.length <= 80) return name;
    }
  }

  // Thread başlığından dene ("Ahmet Yılmaz | Karakter Forumu" → "Ahmet Yılmaz")
  const titlePart = title
    .split(/[|\/\-•—–·]/)[0]
    .replace(/\[.*?\]/g, '')
    .replace(/\(.*?\)/g, '')
    .trim();

  if (titlePart.length >= 3 && titlePart.length <= 80 && /\s/.test(titlePart)) {
    return titlePart;
  }

  return null;
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u')
    .replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── Tekil thread işleme ────────────────────────────────────────────────────

async function processThread(pool: Pool, thread: ThreadChannel, forumChannelId: string): Promise<void> {
  const threadId = thread.id;

  if (await threadExists(pool, threadId)) return;

  // İlk mesajı al
  let firstMessage: Message | null = null;
  try {
    const messages = await thread.messages.fetch({ limit: 1, after: '0' });
    firstMessage = messages.first() ?? null;
  } catch {
    // messages fetch başarısız — yine de kaydedebiliriz
  }

  const ownerId   = thread.ownerId ?? firstMessage?.author.id ?? '';
  const title     = thread.name ?? '';
  let   storyText = '';
  let   sourceType: 'text' | 'pdf' | 'mixed' | 'unknown' = 'unknown';

  if (firstMessage) {
    storyText  = firstMessage.content ?? '';
    sourceType = 'text';

    // Ek dosyalar (PDF / DOCX / TXT)
    for (const attachment of firstMessage.attachments.values()) {
      try {
        const extracted = await fetchStoryAttachmentText(
          attachment.url,
          attachment.name,
          attachment.contentType,
          attachment.size,
        );
        if (extracted.trim()) {
          storyText  = storyText ? `${storyText}\n\n${extracted}` : extracted;
          sourceType = storyText.length > extracted.length ? 'mixed' : 'pdf';
        }
      } catch (e) {
        console.warn(`[stage/forum-importer] Attachment okunamadı (${attachment.name}):`, e);
      }
    }
  }

  // Boyut limiti
  if (storyText.length > STORY_MAX) {
    storyText = storyText.slice(0, STORY_MAX);
  }

  const charName     = extractCharacterName(storyText + '\n' + title, title);
  const normCharName = charName ? normalizeName(charName) : null;
  const status       = charName ? 'approved' : 'needs_review';

  await insertForm(pool, {
    threadId,
    forumChannelId,
    discordId:              ownerId,
    threadTitle:            title || null,
    characterName:          charName,
    normalizedCharacterName: normCharName,
    storyText:              storyText || null,
    sourceType,
    status,
  });

  console.log(`[stage/forum-importer] Import: ${threadId} "${title}" → ${status} (discord: ${ownerId})`);
}

// ─── Bulk import (başlangıçta) ───────────────────────────────────────────────

async function bulkImport(client: Client, pool: Pool, forumChannelId: string): Promise<void> {
  let channel;
  try {
    channel = await client.channels.fetch(forumChannelId);
  } catch (e) {
    console.error('[stage/forum-importer] Forum kanalı alınamadı:', e);
    return;
  }

  if (!channel || channel.type !== ChannelType.GuildForum) {
    console.error('[stage/forum-importer] STAGE_FORUM_CHANNEL_ID bir Forum kanalı değil.');
    return;
  }

  let imported = 0;

  // Aktif thread'ler
  try {
    const active = await channel.threads.fetchActive();
    for (const thread of active.threads.values()) {
      await processThread(pool, thread, forumChannelId).catch((e) =>
        console.warn('[stage/forum-importer] Thread işleme hatası:', e),
      );
      imported++;
    }
  } catch (e) {
    console.warn('[stage/forum-importer] Aktif thread\'ler alınamadı:', e);
  }

  // Arşiv thread'leri (maksimum 3 sayfa × 100 = 300 thread)
  let before: string | undefined;
  let page = 0;
  while (page < 3) {
    try {
      const archived = await channel.threads.fetchArchived({ limit: 100, before });
      for (const thread of archived.threads.values()) {
        await processThread(pool, thread, forumChannelId).catch((e) =>
          console.warn('[stage/forum-importer] Thread işleme hatası:', e),
        );
        imported++;
      }
      if (!archived.hasMore) break;
      before = archived.threads.last()?.id;
      page++;
    } catch (e) {
      console.warn('[stage/forum-importer] Arşiv thread\'ler alınamadı:', e);
      break;
    }
  }

  console.log(`[stage/forum-importer] Bulk import tamamlandı: ${imported} thread işlendi.`);
}

// ─── Servis başlatıcı ────────────────────────────────────────────────────────

export function startForumImporter(client: Client, pool: Pool): void {
  const forumChannelId = env('STAGE_FORUM_CHANNEL_ID');
  if (!forumChannelId) {
    console.warn('[stage/forum-importer] STAGE_FORUM_CHANNEL_ID tanımlanmamış — forum importer devre dışı.');
    return;
  }

  // Başlangıçta mevcut thread'leri içe aktar
  bulkImport(client, pool, forumChannelId).catch((e) =>
    console.error('[stage/forum-importer] Bulk import hatası:', e),
  );

  // Yeni thread açıldığında canlı yak
  client.on('threadCreate', async (thread) => {
    if (thread.parentId !== forumChannelId) return;
    // Thread tam içeriği için kısa bekleme
    await new Promise((r) => setTimeout(r, 3000));
    try {
      await processThread(pool, thread, forumChannelId);
    } catch (e) {
      console.error('[stage/forum-importer] Yeni thread işleme hatası:', e);
    }
  });

  console.log(`[stage/forum-importer] Forum importer başlatıldı (channel: ${forumChannelId})`);
}
