import test from 'node:test';
import assert from 'node:assert/strict';
import {deflateSync} from 'node:zlib';
import {findingsInFile} from '../tools/privacy-check.mjs';

function chunk(type, data) {
  const body = Buffer.from(data);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length);
  return Buffer.concat([length, Buffer.from(type), body, Buffer.alloc(4)]);
}

const drivePath = (drive, rest) => drive + ':' + rest;
const homePath = (name) => '/home' + '/' + name;

function png({text = null, idat = ''} = {}) {
  const parts = [Buffer.from('\x89PNG\r\n\x1a\n', 'latin1'), chunk('IHDR', Buffer.alloc(13))];
  if (text) parts.push(chunk('tEXt', Buffer.from('File\0' + text, 'latin1')));
  parts.push(chunk('zTXt', Buffer.concat([Buffer.from('Note\0\0'), deflateSync(Buffer.from('compressed note', 'utf8'))])));
  parts.push(chunk('IDAT', Buffer.from(idat, 'latin1')));
  parts.push(chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(parts);
}

test('privacy scan reads PNG text metadata and ignores path-like bytes in image data', () => {
  const embedded = png({
    text: drivePath('D', '\\A.I\\Codex\\project.blend'),
    idat: homePath('run' + 'ner/work ') + drivePath('C', '\\Users\\Greg'),
  });
  const metadata = findingsInFile('preview.png', embedded).filter((finding) => finding.kind === 'personal machine path');
  assert.equal(metadata.length, 1);

  const compressed = png({idat: homePath('run' + 'ner/work')});
  assert.equal(
    findingsInFile('preview.png', compressed).some((finding) => finding.kind === 'personal machine path'),
    false,
  );
  assert.equal(
    findingsInFile('notes.txt', Buffer.from(homePath('alice/notes'), 'utf8')).some(
      (finding) => finding.kind === 'personal machine path',
    ),
    true,
  );
});
