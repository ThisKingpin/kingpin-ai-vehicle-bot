import 'dotenv/config';
import { Client, GatewayIntentBits, REST, Routes } from 'discord.js';
import { aracalCommand } from './commands/aracal.js';
import { aracLogCommand } from './commands/arac-log.js';
import { aracYenidenAnalizCommand } from './commands/arac-yeniden-analiz.js';
import { env, getDiscordToken } from './env.js';

const commands = [aracalCommand, aracLogCommand, aracYenidenAnalizCommand];

async function main() {
  const token = getDiscordToken();
  const guildId = env('GUILD_ID');

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  await client.login(token);
  await new Promise<void>((resolve) => client.once('ready', () => resolve()));

  const applicationId = client.user!.id;
  const rest = new REST().setToken(token);
  const body = commands.map((c) => c.data.toJSON());

  if (guildId) {
    await rest.put(Routes.applicationGuildCommands(applicationId, guildId), { body });
    console.log(`Guild slash komutlari kaydedildi (app: ${applicationId}, guild: ${guildId}).`);
  } else {
    await rest.put(Routes.applicationCommands(applicationId), { body });
    console.log(`Global slash komutlari kaydedildi (app: ${applicationId}).`);
  }

  await client.destroy();
}

main().catch(console.error);
