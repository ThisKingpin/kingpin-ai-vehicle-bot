import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const linkRe = /discord(?:app)?\.com\/channels\/(\d+)\/(\d+)(?:\/(\d+))?/i;

describe('Discord link parse', () => {
  it('3 parcali link', () => {
    const match = 'https://discord.com/channels/111/222/333'.match(linkRe);
    assert.ok(match);
    assert.equal(match![3], '333');
  });

  it('2 parcali thread link', () => {
    const match = 'https://discord.com/channels/111/222'.match(linkRe);
    assert.ok(match);
    assert.equal(match![3], undefined);
  });
});
