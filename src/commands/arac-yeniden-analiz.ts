import {
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { runAnalysis } from '../services/analysis.js';
import { autoGrantTopVehicle, formatGrantError, sendGrantAuditLog } from '../services/auto-grant.js';

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
    .setDescription('[Yetkili] Hikayeyi yeniden analiz et ve araci otomatik ver')
    .addStringOption((opt) =>
      opt.setName('hikaye').setDescription('Guncel hikaye metni').setRequired(true),
    )
    .addStringOption((opt) =>
      opt.setName('citizenid').setDescription('CitizenID').setRequired(true),
    )
    .addStringOption((opt) =>
      opt.setName('karakter_adi').setDescription('Karakter adi').setRequired(true),
    )
    .addStringOption((opt) =>
      opt.setName('discord_id').setDescription('Oyuncu Discord ID').setRequired(true),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!isAdmin(interaction)) {
      await interaction.reply({ content: 'Bu komut icin yetkiniz yok.', ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const pending = await runAnalysis({
        discordId: interaction.options.getString('discord_id', true),
        citizenid: interaction.options.getString('citizenid', true),
        characterName: interaction.options.getString('karakter_adi', true),
        serverName: process.env.SERVER_NAME ?? 'Kingpin RP',
        story: interaction.options.getString('hikaye', true),
        forceRefresh: true,
      });

      const granted = await autoGrantTopVehicle(pending, interaction.user.id);
      await sendGrantAuditLog(interaction.client, pending, granted, interaction.user.id);

      await interaction.editReply({
        content: `Yeniden analiz ve otomatik verme tamamlandi.\n**${granted.label}** → ${granted.garage}\nRequest: \`${pending.requestId}\``,
      });
    } catch (err) {
      await interaction.editReply({ content: formatGrantError(err) });
    }
  },
};
