import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { verifyCharacter } from '../services/fivem.js';
import { runAnalysis } from '../services/analysis.js';
import { autoGrantTopVehicle, formatGrantError, sendGrantAuditLog } from '../services/auto-grant.js';
import { buildPlayerGrantedEmbed } from '../embeds/staff.js';
import { resolveStoryText, StoryFetchError, STORY_MAX } from '../services/story-fetch.js';

export const aracalCommand = {
  data: new SlashCommandBuilder()
    .setName('aracal')
    .setDescription('Karakter hikayene gore otomatik arac al')
    .addStringOption((opt) =>
      opt
        .setName('karakter_adi')
        .setDescription('Sunucudaki karakter adin (Ad Soyad)')
        .setRequired(true),
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
        .setDescription('Kisa hikaye (opsiyonel — uzun hikaye icin konu_id kullanin)')
        .setRequired(false)
        .setMaxLength(4000),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const characterName = interaction.options.getString('karakter_adi', true);
    const threadId = interaction.options.getString('konu_id');
    const link = interaction.options.getString('mesaj_linki');
    const directStory = interaction.options.getString('hikaye');
    const discordId = interaction.user.id;
    const serverName = process.env.SERVER_NAME ?? 'Kingpin RP';

    await interaction.deferReply({ ephemeral: true });

    const progress = async (text: string) => {
      try {
        await interaction.editReply({ content: text });
      } catch {
        // ignore
      }
    };

    try {
      await progress('Forum hikayesi okunuyor...');

      const { story, source } = await resolveStoryText(interaction.client, interaction.guildId, {
        direct: directStory,
        threadId,
        link,
      });

      await progress('Karakter dogrulaniyor (FiveM)...');

      const verified = await verifyCharacter(discordId, characterName);
      if (!verified.success || !verified.citizenid) {
        await interaction.editReply({ content: verified.error ?? 'Karakter dogrulanamadi.' });
        return;
      }

      await progress('Hikaye AI ile analiz ediliyor...');

      const pending = await runAnalysis({
        discordId,
        citizenid: verified.citizenid,
        characterName: verified.characterName ?? characterName,
        serverName,
        story,
      });

      const top = pending.recommendations[0];
      if (!top) {
        await interaction.editReply({ content: 'Hikayeniz icin uygun arac bulunamadi.' });
        return;
      }

      await progress('Arac garaja ekleniyor (FiveM)...');

      const granted = await autoGrantTopVehicle(pending, `ai:${discordId}`);
      await sendGrantAuditLog(interaction.client, pending, granted, `ai:${discordId}`);

      const sourceNote =
        source.startsWith('forum') || source.startsWith('link')
          ? `\n\n_Kaynak: forum konusu (${story.length} karakter okundu, max ${STORY_MAX})_`
          : '';

      const embed = buildPlayerGrantedEmbed(
        pending.characterName,
        {
          label: granted.label,
          model: granted.model,
          garage: granted.garage,
          score: top.score,
          reason: top.reason,
        },
        pending.recommendations,
      );

      embed.setFooter({ text: `Kaynak: ${source}` });

      await interaction.editReply({
        content: sourceNote || undefined,
        embeds: [embed],
      });
    } catch (err) {
      const msg = err instanceof StoryFetchError ? err.message : formatGrantError(err);
      await interaction.editReply({ content: msg });
    }
  },
};
