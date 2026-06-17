import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectStoryAttachmentKind,
  normalizeExtractedText,
  parseStoryAttachmentBuffer,
} from '../src/services/attachment-text.js';

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

describe('attachment-text', () => {
  it('pdf/docx/txt turlerini algilar', () => {
    assert.equal(detectStoryAttachmentKind('FOX.pdf'), 'pdf');
    assert.equal(detectStoryAttachmentKind('hikaye.docx'), 'docx');
    assert.equal(detectStoryAttachmentKind('notlar.txt'), 'text');
    assert.equal(detectStoryAttachmentKind('photo.png'), null);
  });

  it('txt buffer okur', async () => {
    const text = await parseStoryAttachmentBuffer(
      'text',
      Buffer.from('  Foster O Neal karakter hikayesi. Kasiyer olarak calisiyor ve arac almak istiyor.  ', 'utf8'),
    );
    assert.ok(text.includes('Foster O Neal'));
    assert.ok(text.length >= 50);
  });

  it('normalizeExtractedText fazla bosluklari temizler', () => {
    assert.equal(normalizeExtractedText('a\r\n\r\n\r\nb'), 'a\n\nb');
  });
});
