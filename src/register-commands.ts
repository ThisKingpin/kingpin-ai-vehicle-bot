import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { aracalCommand } from './commands/aracal.js';
import { aracLogCommand } from './commands/arac-log.js';
import { aracYenidenAnalizCommand } from './commands/arac-yeniden-analiz.js';

const commands = [aracalCommand, aracLogCommand, aracYenidenAnalizCommand];

async function main() {
  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.DISCORD_CLIENT_ID;
  const guildId = process.env.GUILD_ID;
  if (!token || !clientId) throw new Error('DISCORD_TOKEN ve DISCORD_CLIENT_ID gerekli');

  const rest = new REST().setToken(token);
  const body = commands.map((c) => c.data.toJSON());

  if (guildId) {
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body });
    console.log('Guild slash komutlari kaydedildi.');
  } else {
    await rest.put(Routes.applicationCommands(clientId), { body });
    console.log('Global slash komutlari kaydedildi.');
  }
}

main().catch(console.error);
