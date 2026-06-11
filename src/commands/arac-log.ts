import { EmbedBuilder, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { getLogs, FivemApiError } from '../services/fivem.js';

export const aracLogCommand = {
  data: new SlashCommandBuilder()
    .setName('arac-log')
    .setDescription('[Yetkili] Karakter arac basvuru gecmisi')
    .addStringOption((opt) =>
      opt.setName('citizenid').setDescription('CitizenID').setRequired(true),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const citizenid = interaction.options.getString('citizenid', true);
    await interaction.deferReply({ ephemeral: true });

    try {
      const result = await getLogs(citizenid);
      const rows = result.requests ?? [];

      if (rows.length === 0) {
        await interaction.editReply({ content: 'Kayit bulunamadi.' });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle(`Arac Basvuru Log — ${citizenid}`)
        .setColor(0x95a5a6);

      for (const row of rows.slice(0, 10)) {
        embed.addFields({
          name: `${row.request_id} (${row.status})`,
          value: [
            `Karakter: ${row.character_name}`,
            `Arac: ${row.selected_vehicle ?? '-'}`,
            `Tarih: ${row.created_at}`,
          ].join('\n'),
          inline: false,
        });
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      const msg = err instanceof FivemApiError ? err.message : 'Log alinamadi';
      await interaction.editReply({ content: msg });
    }
  },
};
