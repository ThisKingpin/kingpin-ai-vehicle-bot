import { EmbedBuilder } from 'discord.js';
import { env } from '../env.js';

const DEFAULT_BASE = 'https://docs.fivem.net/vehicles';

/** FiveM docs arac render goruntusu (model spawn adi ile). */
export function getVehicleImageUrl(model: string): string {
  const base = (env('VEHICLE_IMAGE_BASE_URL') ?? DEFAULT_BASE).replace(/\/$/, '');
  const slug = model.toLowerCase().trim().replace(/[^a-z0-9_]/g, '');
  return `${base}/${slug}.webp`;
}

export function applyVehicleImage(embed: EmbedBuilder, model: string): void {
  embed.setImage(getVehicleImageUrl(model));
}
