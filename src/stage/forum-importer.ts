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
  type ThreadChannel,
} from 'discord.js';
import type { Pool } from 'mysql2/promise';
import { insertForm, threadExists } from './db.js';
import { enqueueStageImport } from './import-queue.js';
import { extractThreadStoryText } from '../services/story-fetch.js';
import { env, getDiscordToken } from '../env.js';
import { getStageDiscordClient } from './discord-client.js';

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

async function parseThread(
  thread: ThreadChannel,
  forumChannelId: string,
): Promise<{ form: ParsedThreadForm; emptyDebug: string }> {
  let token: string | undefined;
  try {
    token = getDiscordToken();
  } catch {
    token = undefined;
  }

  const { text: storyTextRaw, sourceType, debug } = await extractThreadStoryText(thread, token);
  const title = thread.name ?? '';
  let storyText = storyTextRaw;
  let ownerId = thread.ownerId ?? '';

  if (!ownerId) {
    try {
      const starter = await thread.fetchStarterMessage();
      ownerId = starter?.author.id ?? '';
    } catch {
      // ignore
    }
  }

  if (storyText.length > STORY_MAX) {
    storyText = storyText.slice(0, STORY_MAX);
  }

  const charName = extractCharacterName(`${storyText}\n${title}`, title);
  const normCharName = charName ? normalizeName(charName) : null;

  return {
    emptyDebug: debug,
    form: {
      threadId: thread.id,
      forumChannelId,
      discordId: ownerId,
      threadTitle: title || null,
      characterName: charName,
      normalizedCharacterName: normCharName,
      storyText: storyText || null,
      sourceType,
      status: charName ? 'approved' : 'needs_review',
    },
  };
}

async function saveThread(pool: Pool | null, form: ParsedThreadForm): Promise<boolean> {
  if (pool) {
    if (await threadExists(pool, form.threadId)) return false;
    await insertForm(pool, form);
    return true;
  }

  return enqueueStageImport(form, { allowResync: true });
}

async function processThread(pool: Pool | null, thread: ThreadChannel, forumChannelId: string): Promise<'queued' | 'empty' | 'skipped'> {
  const { form, emptyDebug } = await parseThread(thread, forumChannelId);
  const saved = await saveThread(pool, form);
  if (!saved) return 'skipped';

  const storyLen = form.storyText?.length ?? 0;
  if (storyLen === 0) {
    console.warn(
      `[stage/forum-importer] Bos hikaye: ${form.threadId} "${form.threadTitle ?? ''}" (${emptyDebug})`,
    );
    return 'empty';
  }

  return 'queued';
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
  let queued = 0;
  let empty = 0;

  try {
    const active = await channel.threads.fetchActive();
    for (const thread of active.threads.values()) {
      const result = await processThread(pool, thread, forumChannelId).catch((e) => {
        console.warn('[stage/forum-importer] Thread isleme hatasi:', e);
        return 'skipped' as const;
      });
      imported++;
      if (result === 'queued') queued++;
      else if (result === 'empty') empty++;
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
          const result = await processThread(pool, thread, forumChannelId).catch((e) => {
            console.warn('[stage/forum-importer] Thread isleme hatasi:', e);
            return 'skipped' as const;
          });
          imported++;
          if (result === 'queued') queued++;
          else if (result === 'empty') empty++;
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

  console.log(
    `[stage/forum-importer] Bulk import ozet: ${imported} thread, ${queued} kuyruk, ${empty} bos hikaye`,
  );
}

/** /aracal veya API ile tek konu cek — Discord'dan okur, DB'ye yazmaz. */
export async function fetchStageThreadById(threadId: string): Promise<ParsedThreadForm> {
  const forumChannelId = env('STAGE_FORUM_CHANNEL_ID');
  if (!forumChannelId) {
    throw new Error('STAGE_FORUM_CHANNEL_ID tanimli degil.');
  }

  const id = threadId.trim().replace(/\D/g, '');
  if (!id || id.length < 17) {
    throw new Error('Gecersiz konu ID.');
  }

  const client = getStageDiscordClient();
  let channel;
  try {
    channel = await client.channels.fetch(id);
  } catch (e) {
    logDiscordAccessError('Konu alinamadi', e);
    throw new Error('Konu bulunamadi veya bot bu konuyu goremiyor.');
  }

  if (!channel?.isThread()) {
    throw new Error('Bu ID bir forum konusu (thread) degil.');
  }

  if (channel.parentId !== forumChannelId) {
    throw new Error('Bu konu izin verilen karakter forumunda degil.');
  }

  const { form, emptyDebug } = await parseThread(channel, forumChannelId);
  const storyLen = form.storyText?.length ?? 0;
  if (storyLen === 0) {
    console.warn(
      `[stage/forum-importer] On-demand bos hikaye: ${form.threadId} "${form.threadTitle ?? ''}" (${emptyDebug})`,
    );
  } else {
    console.log(
      `[stage/forum-importer] On-demand import: ${form.threadId} "${form.threadTitle ?? ''}" (${storyLen} karakter)`,
    );
  }

  return form;
}

/** pool=null → pull modu (FiveM MySQL'e yazar). pool varsa legacy direct MySQL. */
export function startForumImporter(client: Client, pool: Pool | null): void {
  const forumChannelId = env('STAGE_FORUM_CHANNEL_ID');
  if (!forumChannelId) {
    console.warn('[stage/forum-importer] STAGE_FORUM_CHANNEL_ID tanimli degil — devre disi.');
    return;
  }

  const onDemandOnly = env('STAGE_BULK_IMPORT') !== '1';
  const mode = pool ? 'direct-mysql' : 'pull-queue';

  if (onDemandOnly) {
    console.log(`[stage/forum-importer] On-demand modu (${mode}) — /aracal ile konu cekilir.`);
    return;
  }

  console.log(`[stage/forum-importer] Bulk import modu (${mode}, channel: ${forumChannelId})`);

  bulkImport(client, pool, forumChannelId).catch((e) =>
    console.error('[stage/forum-importer] Bulk import hatasi:', e),
  );

  client.on('threadCreate', async (thread) => {
    if (thread.parentId !== forumChannelId) return;
    await new Promise((r) => setTimeout(r, 3000));
    try {
      const result = await processThread(pool, thread, forumChannelId);
      if (result === 'empty') {
        console.warn(`[stage/forum-importer] Yeni konu bos hikaye: ${thread.id} "${thread.name}"`);
      }
    } catch (e) {
      console.error('[stage/forum-importer] Yeni thread isleme hatasi:', e);
    }
  });
}
