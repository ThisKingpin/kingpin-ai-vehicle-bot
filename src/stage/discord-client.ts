import type { Client } from 'discord.js';

let stageClient: Client | null = null;

export function setStageDiscordClient(client: Client): void {
  stageClient = client;
}

export function getStageDiscordClient(): Client {
  if (!stageClient?.isReady()) {
    throw new Error('Discord client hazir degil.');
  }
  return stageClient;
}
