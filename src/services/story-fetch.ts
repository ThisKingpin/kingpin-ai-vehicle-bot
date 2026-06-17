import {
  type Attachment,
  type Client,
  type Message,
  type ThreadChannel,
} from 'discord.js';
import { fetchStoryAttachmentText } from './attachment-text.js';
import { env } from '../env.js';

const STORY_MIN = 50;
const STORY_MAX = 12000;

export { STORY_MIN, STORY_MAX };

const FORUM_PERMISSION_HINT =
  'Botun konuyu mention olmadan okuyabilmesi icin bot rolunde forum kanalinda View Channel ve Read Message History yetkileri olmali. Private thread kullaniyorsaniz bot rolune thread erisimi verin veya konuyu public forum post olarak acin.';

export class StoryFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StoryFetchError';
  }
}

function messageToText(message: Message): string {
  const parts: string[] = [];
  if (message.content?.trim()) parts.push(message.content.trim());

  for (const embed of message.embeds) {
    if (embed.title?.trim()) parts.push(embed.title.trim());
    if (embed.description?.trim()) parts.push(embed.description.trim());
    for (const field of embed.fields) {
      if (field.name?.trim() && field.value?.trim()) {
        parts.push(`${field.name.trim()}\n${field.value.trim()}`);
      }
    }
  }

  return parts.join('\n\n').trim();
}

async function parseAttachment(attachment: Attachment): Promise<string> {
  return fetchStoryAttachmentText(
    attachment.url,
    attachment.name ?? 'ek',
    attachment.contentType,
    attachment.size,
  );
}

async function extractMessageStory(message: Message): Promise<string> {
  const parts: string[] = [];
  const body = messageToText(message);
  if (body) parts.push(body);

  for (const attachment of message.attachments.values()) {
    try {
      const fileText = await parseAttachment(attachment);
      if (fileText) {
        parts.push(`[Dosya: ${attachment.name}]\n${fileText}`);
      }
    } catch (err) {
      console.warn(`[story-fetch] Ek okunamadi (${attachment.name}):`, err);
    }
  }

  return parts.join('\n\n').trim();
}

async function combineMessagesStory(messages: Message[]): Promise<string> {
  const parts: string[] = [];
  for (const message of messages) {
    const chunk = await extractMessageStory(message);
    if (chunk) parts.push(chunk);
  }
  return parts.join('\n\n').trim();
}

function validateStory(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length < STORY_MIN) {
    throw new StoryFetchError(`Hikaye cok kisa (min ${STORY_MIN} karakter, bulunan: ${trimmed.length}).`);
  }
  if (trimmed.length > STORY_MAX) {
    return trimmed.slice(0, STORY_MAX);
  }
  return trimmed;
}

function parseDiscordLink(link: string): { guildId: string; channelId: string; messageId?: string } | null {
  const cleaned = link.trim().replace(/^["']|["']$/g, '');
  const match = cleaned.match(/discord(?:app)?\.com\/channels\/(\d+)\/(\d+)(?:\/(\d+))?/i);
  if (!match) return null;
  return {
    guildId: match[1],
    channelId: match[2],
    messageId: match[3],
  };
}

function assertGuildAccess(guildId: string, interactionGuildId: string | null) {
  if (interactionGuildId && guildId !== interactionGuildId) {
    throw new StoryFetchError('Bu link baska bir sunucuya ait.');
  }
}

function assertAllowedForum(thread: ThreadChannel) {
  const allowedForumId = env('FORUM_CHANNEL_ID');
  if (!allowedForumId) return;

  const parentId = thread.parentId;
  if (parentId !== allowedForumId && thread.id !== allowedForumId) {
    throw new StoryFetchError(
      `Bu konu izin verilen hikaye forumunda degil. FORUM_CHANNEL_ID ayarini ve dogru forum ID'sini kontrol edin. ${FORUM_PERMISSION_HINT}`,
    );
  }
}

async function fetchFromThread(_client: Client, thread: ThreadChannel): Promise<string> {
  assertAllowedForum(thread);

  let messages: Message[] = [];

  try {
    const fetched = await thread.messages.fetch({ limit: 25 });
    messages = [...fetched.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  } catch (err) {
    console.warn('[story-fetch] Thread mesajlari okunamadi, starter deneniyor:', err);
  }

  if (messages.length === 0) {
    try {
      const starter = await thread.fetchStarterMessage();
      if (starter) messages = [starter];
    } catch {
      // ignore
    }
  }

  const text = await combineMessagesStory(messages);
  if (!text) {
    throw new StoryFetchError(
      `Konu icerigi okunamadi. Metin yazin veya PDF/DOCX/TXT ekleyin. ${FORUM_PERMISSION_HINT}`,
    );
  }

  return validateStory(text);
}

async function fetchFromThreadId(
  client: Client,
  threadId: string,
  interactionGuildId: string | null,
): Promise<string> {
  const id = threadId.trim().replace(/\D/g, '');
  if (!id || id.length < 17) {
    throw new StoryFetchError('Gecersiz konu ID. Forum konusuna sag tik → Konu ID\'sini Kopyala. Mesaj ID degil, konu/thread ID gerekli.');
  }

  let channel;
  try {
    channel = await client.channels.fetch(id);
  } catch (err) {
    throw new StoryFetchError(`Konu bulunamadi veya bot bu konuyu goremiyor. ${FORUM_PERMISSION_HINT}`);
  }

  if (!channel?.isThread()) {
    throw new StoryFetchError(
      `Bu ID bir forum konusu (thread) degil. Hikaye yazdiginiz forum gonderisinin linkini veya konu ID'sini kullanin. ${FORUM_PERMISSION_HINT}`,
    );
  }

  if (interactionGuildId && channel.guildId !== interactionGuildId) {
    throw new StoryFetchError('Bu konu bu sunucuya ait degil.');
  }

  return fetchFromThread(client, channel);
}

async function fetchFromLink(
  client: Client,
  link: string,
  interactionGuildId: string | null,
): Promise<string> {
  const parsed = parseDiscordLink(link);
  if (!parsed) {
    throw new StoryFetchError(
      'Gecersiz Discord linki. Ornek: https://discord.com/channels/sunucu/konu-id',
    );
  }

  assertGuildAccess(parsed.guildId, interactionGuildId);

  if (parsed.messageId) {
    let channel;
    try {
      channel = await client.channels.fetch(parsed.channelId);
    } catch {
      throw new StoryFetchError(`Linkteki kanal/konu okunamadi. ${FORUM_PERMISSION_HINT}`);
    }
    if (channel?.isThread()) {
      return fetchFromThread(client, channel);
    }

    if (channel && 'messages' in channel) {
      const message = await channel.messages.fetch(parsed.messageId);
      const text = await extractMessageStory(message);
      if (!text) {
        throw new StoryFetchError(
          `Mesajda okunabilir metin veya PDF/DOCX/TXT eki yok. ${FORUM_PERMISSION_HINT}`,
        );
      }
      return validateStory(text);
    }

    throw new StoryFetchError(`Mesaj kanali okunamadi. ${FORUM_PERMISSION_HINT}`);
  }

  return fetchFromThreadId(client, parsed.channelId, interactionGuildId);
}

export async function resolveStoryText(
  client: Client,
  interactionGuildId: string | null,
  opts: {
    direct?: string | null;
    threadId?: string | null;
    link?: string | null;
  },
): Promise<{ story: string; source: string }> {
  const direct = opts.direct?.trim();
  const threadId = opts.threadId?.trim();
  const link = opts.link?.trim();

  const sources = [direct, threadId, link].filter(Boolean);
  if (sources.length === 0) {
    throw new StoryFetchError(
      'Hikaye gerekli: `hikaye` yazin VEYA forum `konu_id` / `mesaj_linki` verin.',
    );
  }
  if (threadId) {
    const story = await fetchFromThreadId(client, threadId, interactionGuildId);
    return { story, source: `forum_konu:${threadId}` };
  }

  if (link) {
    const story = await fetchFromLink(client, link, interactionGuildId);
    return { story, source: `link:${link.slice(0, 80)}` };
  }

  if (direct) {
    return { story: validateStory(direct), source: 'slash_hikaye' };
  }

  throw new StoryFetchError('Hikaye kaynagi bulunamadi.');
}
