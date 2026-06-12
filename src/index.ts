import 'dotenv/config';
import { Client, Collection, Events, GatewayIntentBits, REST, Routes } from 'discord.js';
import { aracalCommand } from './commands/aracal.js';
import { aracLogCommand } from './commands/arac-log.js';
import { aracYenidenAnalizCommand } from './commands/arac-yeniden-analiz.js';
import { handleButtonInteraction } from './handlers/buttons.js';
import { env, getDiscordToken, maskToken } from './env.js';
import { pingBridgeOnStartup } from './services/fivem.js';
import { startApiServer } from './api/server.js';

const commands = [aracalCommand, aracLogCommand, aracYenidenAnalizCommand];

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const commandMap = new Collection<string, (typeof commands)[number]>();
for (const cmd of commands) {
  commandMap.set(cmd.data.name, cmd);
}

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

async function registerCommands(token: string, applicationId: string) {
  const guildId = env('GUILD_ID');
  const rest = new REST().setToken(token);
  const body = commands.map((c) => c.data.toJSON());

  if (guildId) {
    await rest.put(Routes.applicationGuildCommands(applicationId, guildId), { body });
    console.log(`[kingpin-ai-vehicle-bot] Guild komutlari kaydedildi (app: ${applicationId}, guild: ${guildId}).`);
  } else {
    await rest.put(Routes.applicationCommands(applicationId), { body });
    console.log(`[kingpin-ai-vehicle-bot] Global komutlar kaydedildi (app: ${applicationId}).`);
  }
}

async function main() {
  startApiServer();

  const geminiKey = env('GEMINI_API_KEY');
  const openaiKey = env('OPENAI_API_KEY');
  if (!geminiKey && !openaiKey) {
    console.warn(
      '[kingpin-ai-vehicle-bot] UYARI: GEMINI_API_KEY ve OPENAI_API_KEY bos — /aracal AI analizi calismaz.',
    );
  } else if (geminiKey) {
    console.log('[kingpin-ai-vehicle-bot] Gemini API anahtari yuklendi.');
  } else {
    console.warn('[kingpin-ai-vehicle-bot] GEMINI_API_KEY bos — sadece OpenAI fallback kullanilacak.');
  }

  const token = getDiscordToken();
  console.log(`[kingpin-ai-vehicle-bot] Token yuklendi: ${maskToken(token)}`);

  // Once Discord'a baglan — token gecersizse burada anlasilir
  await client.login(token);

  await new Promise<void>((resolve) => {
    if (client.isReady()) {
      resolve();
      return;
    }
    client.once(Events.ClientReady, () => resolve());
  });

  const applicationId = client.user!.id;
  console.log(`[kingpin-ai-vehicle-bot] Giris: ${client.user!.tag} (id: ${applicationId})`);

  const envClientId = env('DISCORD_CLIENT_ID');
  if (envClientId && envClientId !== applicationId) {
    console.warn(
      `[kingpin-ai-vehicle-bot] UYARI: DISCORD_CLIENT_ID (${envClientId}) token'daki app id (${applicationId}) ile uyusmuyor. Token'daki id kullaniliyor.`,
    );
  }

  try {
    await registerCommands(token, applicationId);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[kingpin-ai-vehicle-bot] Slash komut kaydi basarisiz:', msg);
    console.error(
      '[kingpin-ai-vehicle-bot] Cozum: Developer Portal → Bot → Reset Token → Railway DISCORD_TOKEN guncelle.',
    );
    throw err;
  }

  await pingBridgeOnStartup();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
