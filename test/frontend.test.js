import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mascotSkins } from '../src/mascot-assets.js';

test('redesigned interface keeps all literal JS control IDs and no duplicate IDs', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const app = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(ids.length, new Set(ids).size);
  for (const match of app.matchAll(/\$\(['"]#([\w-]+)/g)) assert.ok(ids.includes(match[1]), `missing control ${match[1]}`);
  assert.match(html, /D指导法语/);
  assert.deepEqual(Object.keys(mascotSkins),['hd']);
  assert.equal(mascotSkins.hd.path,'/src/local-assets/deepseek-actions.png');
  assert.equal([...html.matchAll(/id="mascot-sprite"/g)].length,1);
  assert.doesNotMatch(html,/mascot-image|id="mascot-skin"|id="mascot-action"|id="mascot-automatic"|id="mascot-gaze"|id="mascot-motion"/);
  assert.doesNotMatch(html, /fish-teacher\.png/);
  assert.match(html, /rel="noopener noreferrer"/);
});

test('mascot settings show one short user-facing description instead of developer specifications', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const section = html.match(/<section\b(?=[^>]*\bid="mascot-settings")[^>]*>[\s\S]*?<\/section>/)?.[0];
  assert.ok(section, 'missing mascot settings section');
  assert.match(section, /<input\b(?=[^>]*\bid="mascot-visible")(?=[^>]*\btype="checkbox")[^>]*>/);
  assert.match(section, /<button\b(?=[^>]*\bid="mascot-apply")(?=[^>]*\btype="button")[^>]*>应用角色设置<\/button>/);
  assert.match(section, /查词时换姿态，戳一下打招呼。/);
  assert.equal([...section.matchAll(/<p\b[^>]*class="[^"]*\bdemo-note\b[^"]*"[^>]*>/g)].length, 1);
  assert.doesNotMatch(section, /不追鼠标|不调用模型|1\.5\s*秒|一张本机原图/);
});
