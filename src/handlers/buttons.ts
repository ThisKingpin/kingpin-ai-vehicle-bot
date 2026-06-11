import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  type ButtonInteraction,
  type Client,
  PermissionFlagsBits,
} from 'discord.js';
import { grantVehicle, rejectRequest, FivemApiError } from '../services/fivem.js';
import { buildLogEmbed } from '../embeds/staff.js';

const pendingTokens = new Map<string, { grantToken: string; citizenid: string; discordId: string }>();

export function registerPendingRequest(
  requestId: string,
  data: { grantToken: string; citizenid: string; discordId: string },
) {
  pendingTokens.set(requestId, data);
}

export function getPendingRequest(requestId: string) {
  return pendingTokens.get(requestId);
}

function isAdmin(interaction: ButtonInteraction): boolean {
  const roleId = process.env.ADMIN_ROLE_ID;
  if (!roleId) return interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false;
  return interaction.member?.roles instanceof Object &&
    'cache' in interaction.member.roles &&
    (interaction.member.roles as { cache: { has: (id: string) => boolean } }).cache.has(roleId);
}

async function sendLog(client: Client, embed: ReturnType<typeof buildLogEmbed>) {
  const logChannelId = process.env.LOG_CHANNEL_ID;
  if (!logChannelId) return;
  const channel = await client.channels.fetch(logChannelId);
  if (channel?.type === ChannelType.GuildText) {
    await channel.send({ embeds: [embed] });
  }
}

export async function handleButtonInteraction(interaction: ButtonInteraction) {
  if (!interaction.customId.startsWith('ai_vehicle:')) return false;

  if (!isAdmin(interaction)) {
    await interaction.reply({ content: 'Bu islem icin yetkiniz yok.', ephemeral: true });
    return true;
  }

  const parts = interaction.customId.split(':');
  const action = parts[1];
  const requestId = parts[2];

  if (action === 'reject') {
    await interaction.deferReply({ ephemeral: true });
    try {
      await rejectRequest(requestId, interaction.user.id, 'Staff reddi');
      pendingTokens.delete(requestId);
      await interaction.editReply({ content: 'Basvuru reddedildi.' });
      await sendLog(
        interaction.client,
        buildLogEmbed('rejected', { requestId, adminId: interaction.user.id }),
      );
    } catch (err) {
      const msg = err instanceof FivemApiError ? err.message : 'Reddetme basarisiz';
      await interaction.editReply({ content: msg });
    }
    return true;
  }

  if (action === 'approve') {
    const model = parts[3];
    const pending = pendingTokens.get(requestId);
    if (!pending) {
      await interaction.reply({ content: 'Request bulunamadi veya suresi doldu.', ephemeral: true });
      return true;
    }

    await interaction.deferReply({ ephemeral: true });
    try {
      const result = await grantVehicle({
        requestId,
        grantToken: pending.grantToken,
        model,
        citizenid: pending.citizenid,
        adminId: interaction.user.id,
      });

      pendingTokens.delete(requestId);

      await interaction.editReply({
        content: `Onaylandi: **${result.label}** (${result.model}) → Garaj: ${result.garage}`,
      });

      await sendLog(
        interaction.client,
        buildLogEmbed('granted', {
          requestId,
          citizenid: pending.citizenid,
          model: result.model,
          adminId: interaction.user.id,
        }),
      );

      try {
        const user = await interaction.client.users.fetch(pending.discordId);
        await user.send(
          `Arac basvurunuz onaylandi!\n**${result.label}** garajiniza eklendi (${result.garage}).`,
        );
      } catch {
        // DM kapali olabilir
      }

      const disabledRows = interaction.message.components.map((row) => {
        const newRow = new ActionRowBuilder<ButtonBuilder>();
        if ('components' in row) {
          for (const comp of row.components) {
            if (comp.type === 2) {
              newRow.addComponents(ButtonBuilder.from(comp.data).setDisabled(true));
            }
          }
        }
        return newRow;
      });

      await interaction.message.edit({ components: disabledRows });
    } catch (err) {
      const msg = err instanceof FivemApiError ? err.message : 'Onay basarisiz';
      await interaction.editReply({ content: msg });
      await sendLog(
        interaction.client,
        buildLogEmbed('grant_failed', {
          requestId,
          adminId: interaction.user.id,
          model,
          error: msg,
        }),
      );
    }
    return true;
  }

  return false;
}
