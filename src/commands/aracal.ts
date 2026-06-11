import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { verifyCharacter, FivemApiError } from '../services/fivem.js';
import { runAnalysis } from '../services/analysis.js';
import { autoGrantTopVehicle, formatGrantError, sendGrantAuditLog } from '../services/auto-grant.js';
import { buildPlayerGrantedEmbed } from '../embeds/staff.js';

const STORY_MIN = 50;
const STORY_MAX = 4000;

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
        .setName('hikaye')
        .setDescription('Karakter hikayen (min 50 karakter)')
        .setRequired(true)
        .setMaxLength(STORY_MAX),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const characterName = interaction.options.getString('karakter_adi', true);
    const story = interaction.options.getString('hikaye', true).trim();
    const discordId = interaction.user.id;
    const serverName = process.env.SERVER_NAME ?? 'Kingpin RP';

    if (story.length < STORY_MIN) {
      await interaction.reply({
        content: `Hikaye en az ${STORY_MIN} karakter olmali.`,
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const verified = await verifyCharacter(discordId, characterName);
      if (!verified.success || !verified.citizenid) {
        await interaction.editReply({ content: verified.error ?? 'Karakter dogrulanamadi.' });
        return;
      }

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

      const granted = await autoGrantTopVehicle(pending, `ai:${discordId}`);
      await sendGrantAuditLog(interaction.client, pending, granted, `ai:${discordId}`);

      await interaction.editReply({
        embeds: [
          buildPlayerGrantedEmbed(
            pending.characterName,
            {
              label: granted.label,
              model: granted.model,
              garage: granted.garage,
              score: top.score,
              reason: top.reason,
            },
            pending.recommendations,
          ),
        ],
      });
    } catch (err) {
      const msg = formatGrantError(err);
      await interaction.editReply({ content: msg });
    }
  },
};
