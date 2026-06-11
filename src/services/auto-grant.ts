import { ChannelType, type Client } from 'discord.js';
import { grantVehicle, FivemApiError, FivemConnectionError } from './fivem.js';
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

  const result = await grantVehicle({
    requestId: pending.requestId,
    grantToken: pending.grantToken,
    model: top.vehicle,
    citizenid: pending.citizenid,
    adminId: grantedBy,
  });

  return {
    model: result.model,
    label: result.label,
    garage: result.garage,
    vehicleId: result.vehicleId,
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
  if (err instanceof Error && err.message.includes('fetch failed')) {
    return 'FiveM sunucusuna baglanilamadi. Railway FIVEM_BASE_URL ve 30120 portunu kontrol edin.';
  }
  if (err instanceof Error) return err.message;
  return 'Arac verilemedi';
}
