import type { VehicleCatalog, VehicleEntry } from '../types.js';

/** Hikayede gecen kasa tipi anahtar kelimeleri (oncelikli). */
const EXPLICIT_BODY_KEYWORDS: Record<string, string[]> = {
  sedan: ['sedan', 'saloon', 'limuzin'],
  suv: ['suv', 'crossover'],
  pickup: ['pickup', 'kamyonet', 'pikap'],
  compact: ['kompakt', 'compact', 'kucuk arac', 'küçük araç'],
  van: ['minivan', ' van', 'van ', 'minibüs', 'minibus', 'karavan'],
  offroad: ['offroad', 'off-road', 'arazi araci', 'arazi aracı'],
  muscle: ['muscle', 'muscle car'],
  motorcycle: ['motosiklet', 'motosikleti', 'motorlu'],
  bmx: ['bmx', 'bisiklet', 'bicycle', 'fixter'],
};

const CATEGORY_TO_BODY: Record<string, string> = {
  sedans: 'sedan',
  compacts: 'compact',
  vans: 'van',
  suv: 'suv',
  offroad: 'offroad',
  foundation: 'bmx',
  motorcycles: 'motorcycle',
  muscle: 'muscle',
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasWord(text: string, term: string): boolean {
  const normalized = term.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized.includes(' ')) return text.includes(normalized);
  return new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(normalized)}(?:[^a-z0-9]|$)`, 'i').test(text);
}

export interface StoryVehicleSignals {
  explicitBodyTypes: string[];
  mentionedModels: Set<string>;
  forceBicycle: boolean;
}

export function extractStoryVehicleSignals(story: string, catalog: VehicleCatalog): StoryVehicleSignals {
  const text = story.toLowerCase();
  const explicitBodyTypes: string[] = [];

  for (const [bodyType, keywords] of Object.entries(EXPLICIT_BODY_KEYWORDS)) {
    if (keywords.some((kw) => hasWord(text, kw))) {
      explicitBodyTypes.push(bodyType);
    }
  }

  const mentionedModels = new Set<string>();
  for (const vehicle of catalog.vehicles) {
    if (hasWord(text, vehicle.model)) {
      mentionedModels.add(vehicle.model);
    }
  }

  for (const model of [...mentionedModels]) {
    const entry = catalog.vehicles.find((v) => v.model === model);
    if (!entry) continue;
    const fromClass = entry.class === 'old_sedan' ? 'sedan' : entry.class;
    if (!explicitBodyTypes.includes(fromClass)) explicitBodyTypes.push(fromClass);
    if (entry.category) {
      const mapped = CATEGORY_TO_BODY[entry.category];
      if (mapped && !explicitBodyTypes.includes(mapped)) explicitBodyTypes.push(mapped);
    }
  }

  const forceBicycle = explicitBodyTypes.includes('bmx')
    || ['bmx', 'bisiklet', 'bicycle', 'fixter'].some((kw) => hasWord(text, kw));

  return {
    explicitBodyTypes: [...new Set(explicitBodyTypes)],
    mentionedModels,
    forceBicycle,
  };
}

export function bodyTypeForVehicle(vehicle: VehicleEntry): string {
  if (vehicle.class === 'old_sedan') return 'sedan';
  if (vehicle.category && CATEGORY_TO_BODY[vehicle.category]) {
    return CATEGORY_TO_BODY[vehicle.category];
  }
  return vehicle.class;
}

export function vehicleMatchesBodyType(vehicle: VehicleEntry, bodyType: string): boolean {
  const vType = bodyTypeForVehicle(vehicle);
  if (vType === bodyType) return true;
  if (bodyType === 'sedan' && (vehicle.class === 'sedan' || vehicle.class === 'old_sedan')) return true;
  if (bodyType === 'offroad' && (vehicle.class === 'offroad' || vehicle.class === 'pickup')) return true;
  if (bodyType === 'pickup' && vehicle.class === 'pickup') return true;
  if (bodyType === 'suv' && vehicle.class === 'suv') return true;
  return false;
}

export function bodyTypeConflicts(preferred: string[], vehicle: VehicleEntry): boolean {
  if (preferred.length === 0) return false;

  const vType = bodyTypeForVehicle(vehicle);
  const wantsSedan = preferred.includes('sedan') || preferred.includes('compact');
  const wantsSuvFamily = preferred.some((p) => ['suv', 'pickup', 'offroad'].includes(p));
  const wantsBmx = preferred.includes('bmx');
  const wantsMotor = preferred.includes('motorcycle');

  if (wantsBmx && vType !== 'bmx') return true;
  if (wantsMotor && preferred.length === 1 && vType !== 'motorcycle') return true;

  if (wantsSedan && !wantsSuvFamily && ['suv', 'pickup', 'offroad', 'van'].includes(vType)) {
    return true;
  }

  if (wantsSuvFamily && !wantsSedan && (vType === 'sedan' || vType === 'compact')) {
    return true;
  }

  const strictTypes = ['sedan', 'suv', 'pickup', 'compact', 'van', 'offroad', 'muscle', 'motorcycle', 'bmx'];
  const strictPreferred = preferred.filter((p) => strictTypes.includes(p));
  if (strictPreferred.length > 0 && !strictPreferred.some((p) => vehicleMatchesBodyType(vehicle, p))) {
    return true;
  }

  return false;
}

export function storySignalScore(
  signals: StoryVehicleSignals | undefined,
  vehicle: VehicleEntry,
  catalog?: VehicleCatalog,
): number {
  if (!signals) return 0;

  if (signals.forceBicycle) {
    return vehicle.class === 'bmx' ? 500 : -400;
  }

  let score = 0;

  if (signals.mentionedModels.has(vehicle.model)) {
    score -= 250;
  } else if (signals.mentionedModels.size > 0 && catalog) {
    for (const model of signals.mentionedModels) {
      const ref = catalog.vehicles.find((v) => v.model === model);
      if (ref && vehicleMatchesBodyType(vehicle, bodyTypeForVehicle(ref))) {
        score += 55;
        break;
      }
    }
  }

  if (signals.explicitBodyTypes.length > 0) {
    if (signals.explicitBodyTypes.some((t) => vehicleMatchesBodyType(vehicle, t))) {
      score += 85;
    } else if (bodyTypeConflicts(signals.explicitBodyTypes, vehicle)) {
      score -= 95;
    }
  }

  return score;
}
