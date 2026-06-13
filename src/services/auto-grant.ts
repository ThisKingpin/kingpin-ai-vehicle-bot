import { ChannelType, type Client } from 'discord.js';
import { grantVehicle, saveAndGrant, adminRegrant, FivemApiError, FivemConnectionError } from './fivem.js';
import { hashStory } from './analysis.js';
import { loadVehicleCatalog } from './scorer.js';
import { buildLogEmbed, buildAuditEmbed } from '../embeds/staff.js';
import type { PendingRequest } from '../types.js';

export async function autoGrantTopVehicle(
  pending: PendingRequest,
  grantedBy = 'ai_auto',
): Promise<{ model: string; label: string; garage: string; vehicleId: number }> {
  const top = pending.recommendations[0];
  if (!top) {
    throw new Error('Analiz sonucu arac onerisi uretilemedi.');
  }

  const catalog = loadVehicleCatalog();
  const storyHash = pending.storyHash ?? hashStory(pending.storyText);
  const vehiclesVersion = pending.vehiclesVersion ?? catalog.version;

  let result: { model: string; label: string; garage: string; vehicleId: number };

  if (pending.grantToken) {
    const granted = await grantVehicle({
      requestId: pending.requestId,
      grantToken: pending.grantToken,
      model: top.vehicle,
      citizenid: pending.citizenid,
      adminId: grantedBy,
    });
    result = {
      model: granted.model,
      label: granted.label,
      garage: granted.garage,
      vehicleId: granted.vehicleId,
    };
  } else {
    const granted = await saveAndGrant({
      requestId: pending.requestId,
      discordId: pending.discordId,
      citizenid: pending.citizenid,
      characterName: pending.characterName,
      serverName: pending.serverName,
      storyText: pending.storyText,
      storyHash,
      vehiclesVersion,
      aiProfileJson: JSON.stringify(pending.analysis),
      recommendedVehiclesJson: JSON.stringify(pending.recommendations),
      topScoresJson: JSON.stringify(pending.recommendations),
      model: top.vehicle,
      adminId: grantedBy,
    });
    result = {
      model: granted.model,
      label: granted.label,
      garage: granted.garage,
      vehicleId: granted.vehicleId,
    };
  }

  return result;
}

/** Yetkili yeniden analiz: onceki AI aracini siler, kayitlari sifirlar, yeni arac verir. */
export async function adminRegrantTopVehicle(
  pending: PendingRequest,
  grantedBy: string,
): Promise<{ model: string; label: string; garage: string; vehicleId: number; replaced: boolean }> {
  const top = pending.recommendations[0];
  if (!top) {
    throw new Error('Analiz sonucu arac onerisi uretilemedi.');
  }

  const catalog = loadVehicleCatalog();
  const storyHash = pending.storyHash ?? hashStory(pending.storyText);
  const vehiclesVersion = pending.vehiclesVersion ?? catalog.version;

  const granted = await adminRegrant({
    requestId: pending.requestId,
    discordId: pending.discordId,
    citizenid: pending.citizenid,
    characterName: pending.characterName,
    serverName: pending.serverName,
    storyText: pending.storyText,
    storyHash,
    vehiclesVersion,
    aiProfileJson: JSON.stringify(pending.analysis),
    recommendedVehiclesJson: JSON.stringify(pending.recommendations),
    topScoresJson: JSON.stringify(pending.recommendations),
    model: top.vehicle,
    adminId: grantedBy,
  });

  return {
    model: granted.model,
    label: granted.label,
    garage: granted.garage,
    vehicleId: granted.vehicleId,
    replaced: granted.replaced === true,
  };
}

export async function sendGrantAuditLog(
  client: Client,
  pending: PendingRequest,
  grant: { model: string; label: string; garage: string },
  grantedBy: string,
) {
  const logChannelId = process.env.LOG_CHANNEL_ID;
  if (!logChannelId) return;

  const channel = await client.channels.fetch(logChannelId);
  if (channel?.type !== ChannelType.GuildText) return;

  await channel.send({
    embeds: [
      buildAuditEmbed(pending, grant),
      buildLogEmbed('auto_granted', {
        requestId: pending.requestId,
        citizenid: pending.citizenid,
        model: grant.model,
        adminId: grantedBy,
      }),
    ],
  });
}

export function formatGrantError(err: unknown): string {
  if (err instanceof FivemConnectionError) return err.message;
  if (err instanceof FivemApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Arac verilemedi';
}
