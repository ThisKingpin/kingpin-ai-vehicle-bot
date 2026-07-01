/**
 * STAGE Forum İçe Aktarıcı
 *
 * Discord karakterler forumundaki thread'leri okur.
 * Pull modu (varsayılan): kuyruğa ekler → FiveM script MySQL'e yazar.
 * Legacy mod: STAGE_DB_HOST tanımlıysa doğrudan MySQL'e yazar.
 */

import {
  ChannelType,
  type Client,
  type Message,
  type ThreadChannel,
} from 'discord.js';
import type { Pool } from 'mysql2/promise';
import { insertForm, threadExists } from './db.js';
import { enqueueStageImport } from './import-queue.js';
import { fetchStoryAttachmentText } from '../services/attachment-text.js';
import { env } from '../env.js';

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

function logDiscordAccessError(scope: string, err: unknown): void {
  const code = err && typeof err === 'object' && 'code' in err
    ? Number((err as { code: number }).code)
    : null;

  if (code === 50001) {
    console.warn(`[stage/forum-importer] ${scope}: Missing Access (50001).`);
    console.warn(
      '[stage/forum-importer] Cozum: Bot rolune "karakterler" forum kanalinda su izinleri ver:',
    );
    console.warn('  - Kanallari Gor (View Channel)');
    console.warn('  - Mesaj Gecmisini Oku (Read Message History)');
    console.warn('  - Konulari Yonet (Manage Threads) — arsiv konulari icin genelde gerekli');
    console.warn('  Kategori izinlerinde bot rolunun engellenmedigini kontrol et.');
    return;
  }

  console.warn(`[stage/forum-importer] ${scope}:`, err);
}

function extractCharacterName(text: string, title: string): string | null {
  for (const pat of NAME_PATTERNS) {
    const m = text.match(pat);
    if (m) {
      const name = m[1].replace(/\*+/g, '').trim().split('\n')[0].trim();
      if (name.length >= 2 && name.length <= 80) return name;
    }
  }

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

export interface ParsedThreadForm {
  threadId: string;
  forumChannelId: string;
  discordId: string;
  threadTitle: string | null;
  characterName: string | null;
  normalizedCharacterName: string | null;
  storyText: string | null;
  sourceType: 'text' | 'pdf' | 'mixed' | 'unknown';
  status: 'approved' | 'needs_review';
}

async function parseThread(thread: ThreadChannel, forumChannelId: string): Promise<ParsedThreadForm> {
  let firstMessage: Message | null = null;

  // Forum konularinda hikaye starter mesajda — messages.fetch({limit:1}) yanlis mesaji alabilir
  try {
    firstMessage = await thread.fetchStarterMessage();
  } catch {
    try {
      const messages = await thread.messages.fetch({ limit: 100 });
      if (messages.size > 0) {
        const arr = [...messages.values()];
        firstMessage = arr.reduce((oldest, msg) =>
          (BigInt(msg.id) < BigInt(oldest.id) ? msg : oldest),
        );
      }
    } catch {
      // devam
    }
  }

  const ownerId = thread.ownerId ?? firstMessage?.author.id ?? '';
  const title = thread.name ?? '';
  let storyText = '';
  let sourceType: 'text' | 'pdf' | 'mixed' | 'unknown' = 'unknown';

  if (firstMessage) {
    storyText = firstMessage.content ?? '';
    sourceType = 'text';

    for (const attachment of firstMessage.attachments.values()) {
      try {
        const extracted = await fetchStoryAttachmentText(
          attachment.url,
          attachment.name,
          attachment.contentType,
          attachment.size,
        );
        if (extracted.trim()) {
          storyText = storyText ? `${storyText}\n\n${extracted}` : extracted;
          sourceType = storyText.length > extracted.length ? 'mixed' : 'pdf';
        }
      } catch (e) {
        console.warn(`[stage/forum-importer] Attachment okunamadi (${attachment.name}):`, e);
      }
    }
  }

  if (storyText.length > STORY_MAX) {
    storyText = storyText.slice(0, STORY_MAX);
  }

  const charName = extractCharacterName(`${storyText}\n${title}`, title);
  const normCharName = charName ? normalizeName(charName) : null;

  return {
    threadId: thread.id,
    forumChannelId,
    discordId: ownerId,
    threadTitle: title || null,
    characterName: charName,
    normalizedCharacterName: normCharName,
    storyText: storyText || null,
    sourceType,
    status: charName ? 'approved' : 'needs_review',
  };
}

async function saveThread(pool: Pool | null, form: ParsedThreadForm): Promise<boolean> {
  if (pool) {
    if (await threadExists(pool, form.threadId)) return false;
    await insertForm(pool, form);
    return true;
  }

  return enqueueStageImport(form);
}

async function processThread(pool: Pool | null, thread: ThreadChannel, forumChannelId: string): Promise<void> {
  const form = await parseThread(thread, forumChannelId);
  const saved = await saveThread(pool, form);
  if (!saved) return;

  const mode = pool ? 'mysql' : 'queue';
  const storyLen = form.storyText?.length ?? 0;
  const warnEmpty = storyLen === 0 ? ' | UYARI: hikaye metni bos' : '';
  console.log(
    `[stage/forum-importer] Import (${mode}): ${form.threadId} "${form.threadTitle ?? ''}" → ${form.status} | story: ${storyLen} chars${warnEmpty}`,
  );
}

async function bulkImport(client: Client, pool: Pool | null, forumChannelId: string): Promise<void> {
  let channel;
  try {
    channel = await client.channels.fetch(forumChannelId);
  } catch (e) {
    logDiscordAccessError('Forum kanali alinamadi', e);
    return;
  }

  if (!channel || channel.type !== ChannelType.GuildForum) {
    console.error('[stage/forum-importer] STAGE_FORUM_CHANNEL_ID bir Forum kanali degil.');
    return;
  }

  let imported = 0;

  try {
    const active = await channel.threads.fetchActive();
    for (const thread of active.threads.values()) {
      await processThread(pool, thread, forumChannelId).catch((e) =>
        console.warn('[stage/forum-importer] Thread isleme hatasi:', e),
      );
      imported++;
    }
  } catch (e) {
    logDiscordAccessError('Aktif threadler alinamadi', e);
  }

  if (env('STAGE_SKIP_ARCHIVED_IMPORT') === '1') {
    console.log('[stage/forum-importer] Arsiv import atlandi (STAGE_SKIP_ARCHIVED_IMPORT=1).');
  } else {
    let before: string | undefined;
    let page = 0;
    let archivedOk = false;

    while (page < 3) {
      try {
        const archived = await channel.threads.fetchArchived({ limit: 100, before });
        archivedOk = true;
        for (const thread of archived.threads.values()) {
          await processThread(pool, thread, forumChannelId).catch((e) =>
            console.warn('[stage/forum-importer] Thread isleme hatasi:', e),
          );
          imported++;
        }
        if (!archived.hasMore) break;
        before = archived.threads.last()?.id;
        page++;
      } catch (e) {
        logDiscordAccessError('Arsiv threadler alinamadi', e);
        if (!archivedOk) {
          console.warn('[stage/forum-importer] Aktif konular import edildi; arsiv atlandi. Yeni konular threadCreate ile yakalanir.');
        }
        break;
      }
    }
  }

  console.log(`[stage/forum-importer] Bulk import tamamlandi: ${imported} thread islendi.`);
}

/** pool=null → pull modu (FiveM MySQL'e yazar). pool varsa legacy direct MySQL. */
export function startForumImporter(client: Client, pool: Pool | null): void {
  const forumChannelId = env('STAGE_FORUM_CHANNEL_ID');
  if (!forumChannelId) {
    console.warn('[stage/forum-importer] STAGE_FORUM_CHANNEL_ID tanimli degil — devre disi.');
    return;
  }

  const mode = pool ? 'direct-mysql' : 'pull-queue';
  console.log(`[stage/forum-importer] Baslatildi (${mode}, channel: ${forumChannelId})`);

  bulkImport(client, pool, forumChannelId).catch((e) =>
    console.error('[stage/forum-importer] Bulk import hatasi:', e),
  );

  client.on('threadCreate', async (thread) => {
    if (thread.parentId !== forumChannelId) return;
    await new Promise((r) => setTimeout(r, 3000));
    try {
      await processThread(pool, thread, forumChannelId);
    } catch (e) {
      console.error('[stage/forum-importer] Yeni thread isleme hatasi:', e);
    }
  });
}
