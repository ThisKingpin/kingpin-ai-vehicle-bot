import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseVisualRankJson } from '../src/services/visual-vehicle-analysis.js';

describe('parseVisualRankJson', () => {
  it('allowed modelleri sirayla dondurur', () => {
    const parsed = parseVisualRankJson(
      JSON.stringify({ ranked_models: ['impaler', 'premier', 'stanier'] }),
      ['premier', 'stanier', 'impaler'],
    );
    assert.deepEqual(parsed, ['impaler', 'premier', 'stanier']);
  });

  it('izin verilmeyen ve tekrar eden modelleri filtreler', () => {
    const parsed = parseVisualRankJson(
      JSON.stringify({ ranked_models: ['voodoo', 'premier', 'premier', 'unknown'] }),
      ['premier', 'stanier'],
    );
    assert.deepEqual(parsed, ['premier']);
  });

  it('gecersiz formatta bos siralama dondurur', () => {
    const parsed = parseVisualRankJson(JSON.stringify({ ranked_models: 'premier' }), ['premier']);
    assert.deepEqual(parsed, []);
  });
});
