import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  GeminiContentBlockedError,
  getResponseBlockReason,
  isContentBlockedError,
  wrapStoryForAnalysis,
} from '../src/services/gemini.js';

describe('gemini content block helpers', () => {
  it('wrapStoryForAnalysis adds fiction preamble', () => {
    const wrapped = wrapStoryForAnalysis('Test hikayesi');
    assert.match(wrapped, /KURGU \/ FICTION/);
    assert.match(wrapped, /Test hikayesi/);
  });

  it('wrapStoryForAnalysis truncates long stories', () => {
    const long = 'a'.repeat(20_000);
    const wrapped = wrapStoryForAnalysis(long, 100);
    assert.ok(wrapped.length < long.length);
    assert.match(wrapped, /kesildi/);
  });

  it('getResponseBlockReason reads promptFeedback', () => {
    const reason = getResponseBlockReason({
      response: {
        promptFeedback: { blockReason: 'PROHIBITED_CONTENT' },
      },
    } as never);
    assert.equal(reason, 'PROHIBITED_CONTENT');
  });

  it('isContentBlockedError detects GeminiContentBlockedError', () => {
    assert.equal(
      isContentBlockedError(new GeminiContentBlockedError('PROHIBITED_CONTENT')),
      true,
    );
  });
});
