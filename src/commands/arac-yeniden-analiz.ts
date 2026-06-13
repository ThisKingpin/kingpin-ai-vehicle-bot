import {
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { runAnalysis } from '../services/analysis.js';
import { adminRegrantTopVehicle, formatGrantError, sendGrantAuditLog } from '../services/auto-grant.js';
import { buildPlayerGrantedEmbed } from '../embeds/staff.js';
import { resolveStoryText, StoryFetchError, STORY_MAX } from '../services/story-fetch.js';

function isAdmin(interaction: ChatInputCommandInteraction): boolean {
  const roleId = process.env.ADMIN_ROLE_ID;
  if (!roleId) return interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false;
  return (
    interaction.member?.roles instanceof Object &&
    'cache' in interaction.member.roles &&
    (interaction.member.roles as { cache: { has: (id: string) => boolean } }).cache.has(roleId)
  );
}

export const aracYenidenAnalizCommand = {
  data: new SlashCommandBuilder()
    .setName('arac-yeniden-analiz')
    .setDescription('[Yetkili] Eski AI aracini sil, yeniden analiz et ve yeni arac ver')
    .addStringOption((opt) =>
      opt.setName('citizenid').setDescription('CitizenID').setRequired(true),
    )
    .addStringOption((opt) =>
      opt.setName('karakter_adi').setDescription('Karakter adi').setRequired(true),
    )
    .addStringOption((opt) =>
      opt.setName('discord_id').setDescription('Oyuncu Discord ID').setRequired(true),
    )
    .addStringOption((opt) =>
      opt
        .setName('konu_id')
        .setDescription('Forum hikaye konusu ID (sag tik → Konu ID\'sini Kopyala)')
        .setRequired(false),
    )
    .addStringOption((opt) =>
      opt
        .setName('mesaj_linki')
        .setDescription('Forum gonderi linki (channels/.../konu-id)')
        .setRequired(false),
    )
    .addStringOption((opt) =>
      opt
        .setName('hikaye')
        .setDescription('Hikaye metni (opsiyonel — uzun hikaye icin konu_id kullanin)')
        .setRequired(false)
        .setMaxLength(4000),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!isAdmin(interaction)) {
      await interaction.reply({ content: 'Bu komut icin yetkiniz yok.', ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      await interaction.editReply({ content: 'Forum hikayesi okunuyor...' });

      const { story, source } = await resolveStoryText(interaction.client, interaction.guildId, {
        direct: interaction.options.getString('hikaye'),
        threadId: interaction.options.getString('konu_id'),
        link: interaction.options.getString('mesaj_linki'),
      });

      await interaction.editReply({ content: 'Eski AI araci kaldiriliyor, yeniden analiz ediliyor...' });

      const pending = await runAnalysis({
        discordId: interaction.options.getString('discord_id', true),
        citizenid: interaction.options.getString('citizenid', true),
        characterName: interaction.options.getString('karakter_adi', true),
        serverName: process.env.SERVER_NAME ?? 'Kingpin RP',
        story,
        forceRefresh: true,
      });

      const granted = await adminRegrantTopVehicle(pending, interaction.user.id);
      await sendGrantAuditLog(interaction.client, pending, granted, interaction.user.id);

      const sourceNote =
        source.startsWith('forum') || source.startsWith('link')
          ? ` (${story.length} karakter, max ${STORY_MAX})`
          : '';

      const top = pending.recommendations[0];
      const embed = buildPlayerGrantedEmbed(
        pending.characterName,
        {
          label: granted.label,
          model: granted.model,
          garage: granted.garage,
          score: top?.score ?? 0,
          reason: top?.reason ?? '',
        },
        pending.recommendations,
      );
      embed.setFooter({ text: `Kaynak: ${source}` });

      const replacedNote = granted.replaced
        ? 'Onceki AI araci garajdan silindi.'
        : 'Onceki AI araci bulunamadi (sadece kayitlar sifirlandi).';

      await interaction.editReply({
        content: `${replacedNote}\nRequest: \`${pending.requestId}\`${sourceNote}`,
        embeds: [embed],
      });
    } catch (err) {
      const msg = err instanceof StoryFetchError ? err.message : formatGrantError(err);
      await interaction.editReply({ content: msg });
    }
  },
};
