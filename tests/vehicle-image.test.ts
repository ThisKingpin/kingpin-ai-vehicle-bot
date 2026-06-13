import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getVehicleImageUrl } from '../src/services/vehicle-image.js';

describe('getVehicleImageUrl', () => {
  it('uses FiveM docs webp by spawn name', () => {
    assert.equal(getVehicleImageUrl('Granger'), 'https://docs.fivem.net/vehicles/granger.webp');
  });

  it('sanitizes model slug', () => {
    assert.equal(getVehicleImageUrl(' tailgater2 '), 'https://docs.fivem.net/vehicles/tailgater2.webp');
  });
});
