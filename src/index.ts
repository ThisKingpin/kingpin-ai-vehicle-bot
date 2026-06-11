import 'dotenv/config';
import { Client, Collection, Events, GatewayIntentBits, REST, Routes } from 'discord.js';
import { aracalCommand } from './commands/aracal.js';
import { aracLogCommand } from './commands/arac-log.js';
import { aracYenidenAnalizCommand } from './commands/arac-yeniden-analiz.js';
import { handleButtonInteraction } from './handlers/buttons.js';

const commands = [aracalCommand, aracLogCommand, aracYenidenAnalizCommand];

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const commandMap = new Collection<string, (typeof commands)[number]>();
for (const cmd of commands) {
  commandMap.set(cmd.data.name, cmd);
}

client.once(Events.ClientReady, (c) => {
  console.log(`[kingpin-ai-vehicle-bot] Giris yapildi: ${c.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isChatInputCommand()) {
    const command = commandMap.get(interaction.commandName);
    if (!command) return;
    try {
      await command.execute(interaction);
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'Komut hatasi';
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: msg, ephemeral: true });
      } else {
        await interaction.reply({ content: msg, ephemeral: true });
      }
    }
    return;
  }

  if (interaction.isButton()) {
    try {
      await handleButtonInteraction(interaction);
    } catch (err) {
      console.error(err);
    }
  }
});

async function registerCommands() {
  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.DISCORD_CLIENT_ID;
  const guildId = process.env.GUILD_ID;
  if (!token || !clientId) return;

  const rest = new REST().setToken(token);
  const body = commands.map((c) => c.data.toJSON());

  if (guildId) {
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body });
    console.log('[kingpin-ai-vehicle-bot] Guild komutlari kaydedildi.');
  } else {
    await rest.put(Routes.applicationCommands(clientId), { body });
    console.log('[kingpin-ai-vehicle-bot] Global komutlar kaydedildi.');
  }
}

async function main() {
  if (!process.env.DISCORD_TOKEN) {
    throw new Error('DISCORD_TOKEN env eksik');
  }
  await registerCommands();
  await client.login(process.env.DISCORD_TOKEN);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
