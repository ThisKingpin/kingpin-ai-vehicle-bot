import {
  ChannelType,
  type Client,
  type Message,
  type ThreadChannel,
} from 'discord.js';
import { env } from '../env.js';

const STORY_MIN = 50;
const STORY_MAX = 12000;

export { STORY_MIN, STORY_MAX };

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
      'Bu konu izin verilen hikaye forumunda degil. Dogru forumda acilan konuyu kullanin.',
    );
  }
}

async function fetchFromThread(client: Client, thread: ThreadChannel): Promise<string> {
  assertAllowedForum(thread);

  let text = '';

  try {
    const starter = await thread.fetchStarterMessage();
    if (starter) text = messageToText(starter);
  } catch {
    // starter yoksa mesajlardan oku
  }

  if (text.length < STORY_MIN) {
    const messages = await thread.messages.fetch({ limit: 10 });
    const sorted = [...messages.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    const combined = sorted.map(messageToText).filter(Boolean).join('\n\n');
    if (combined.length > text.length) text = combined;
  }

  if (!text) {
    throw new StoryFetchError(
      'Konu icerigi okunamadi. Botun forum kanalini gorebilmesi ve Mesaj Gecmisini Okuma yetkisi olmali.',
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
    throw new StoryFetchError('Gecersiz konu ID. Forum konusuna sag tik → Konu ID\'sini Kopyala.');
  }

  const channel = await client.channels.fetch(id);
  if (!channel?.isThread()) {
    throw new StoryFetchError(
      'Bu ID bir forum konusu (thread) degil. Hikaye yazdiginiz forum gonderisinin linkini veya konu ID\'sini kullanin.',
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
    const channel = await client.channels.fetch(parsed.channelId);
    if (channel?.isThread()) {
      return fetchFromThread(client, channel);
    }

    if (
      channel &&
      (channel.type === ChannelType.GuildText ||
        channel.type === ChannelType.GuildForum ||
        channel.type === ChannelType.GuildAnnouncement)
    ) {
      const message = await channel.messages.fetch(parsed.messageId);
      return validateStory(messageToText(message));
    }

    throw new StoryFetchError('Mesaj kanali okunamadi.');
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
  if (sources.length > 1 && direct && (threadId || link)) {
    // direct + link ikisi doluysa link/konu oncelikli (uzun hikaye icin)
    if (threadId || link) {
      // ignore short direct if forum source provided
    }
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
