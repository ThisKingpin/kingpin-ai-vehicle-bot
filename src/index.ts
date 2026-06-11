import 'dotenv/config';
import { Client, Collection, Events, GatewayIntentBits, REST, Routes } from 'discord.js';
import { aracalCommand } from './commands/aracal.js';
import { aracLogCommand } from './commands/arac-log.js';
import { aracYenidenAnalizCommand } from './commands/arac-yeniden-analiz.js';
import { handleButtonInteraction } from './handlers/buttons.js';

/** Railway/env: basta-sonda bosluk ve yanlis tirnak temizle */
function env(name: string): string | undefined {
  const raw = process.env[name];
  if (!raw) return undefined;
  return raw.trim().replace(/^["']|["']$/g, '');
}

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
  const token = env('DISCORD_TOKEN');
  const clientId = env('DISCORD_CLIENT_ID');
  const guildId = env('GUILD_ID');
  if (!token || !clientId) {
    console.warn('[kingpin-ai-vehicle-bot] DISCORD_TOKEN veya DISCORD_CLIENT_ID eksik — slash komutlari kaydedilmedi.');
    return;
  }

  const rest = new REST().setToken(token);
  const body = commands.map((c) => c.data.toJSON());

  try {
    if (guildId) {
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body });
      console.log(`[kingpin-ai-vehicle-bot] Guild komutlari kaydedildi (guild: ${guildId}).`);
    } else {
      await rest.put(Routes.applicationCommands(clientId), { body });
      console.log('[kingpin-ai-vehicle-bot] Global komutlar kaydedildi.');
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[kingpin-ai-vehicle-bot] Slash komut kaydi basarisiz (401 = token veya client ID hatali):', msg);
    throw err;
  }
}

async function main() {
  const token = env('DISCORD_TOKEN');
  if (!token) {
    throw new Error('DISCORD_TOKEN env eksik');
  }
  await registerCommands();
  await client.login(token);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
