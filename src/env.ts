/** Railway/env: bosluk, tirnak, yanlis "Bot " on eki temizle */
export function env(name: string): string | undefined {
  const raw = process.env[name];
  if (!raw) return undefined;
  return raw.trim().replace(/^["']|["']$/g, '');
}

export function getDiscordToken(): string {
  const token = env('DISCORD_TOKEN');
  if (!token) {
    throw new Error('DISCORD_TOKEN env eksik. Railway Variables sekmesine Bot token ekleyin.');
  }

  const normalized = token.replace(/^Bot\s+/i, '');

  if (!normalized.includes('.') || normalized.split('.').length < 3) {
    throw new Error(
      'DISCORD_TOKEN formati hatali. Developer Portal → Bot → Token kopyalayin (Client Secret degil).',
    );
  }

  return normalized;
}

export function maskToken(token: string): string {
  if (token.length < 12) return '***';
  return `${token.slice(0, 8)}...${token.slice(-4)}`;
}
