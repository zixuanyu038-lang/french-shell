import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createAppServer } from '../server.mjs';
import { mascotSkins, mascotStates, mascotPose } from '../src/mascot-assets.js';

const assetPath = '/src/local-assets/deepseek-actions.png';
const assetHash = 'B3F5063653A5366F35F93E95A2717076571C67A390A99794C2B7FA35E155146B';
const upstream = 'https://github.com/YunYueSama/codex-deepseek-pet';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase();
const projectFile = path => new URL('../' + path.replace(/^\//, ''), import.meta.url);

test('release includes the single unchanged HD PNG with its pinned hash and real dimensions', async () => {
  assert.deepEqual(Object.keys(mascotSkins), ['hd']);
  assert.equal(mascotSkins.hd.path, assetPath);
  assert.deepEqual([...new Set(Object.keys(mascotStates).map(state => mascotPose('hd', state).path))], [assetPath]);
  const png = await readFile(projectFile(assetPath));
  assert.equal(sha256(png), assetHash, 'the upstream character image must remain byte-for-byte unchanged');
  assert.deepEqual(png.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  assert.equal(png.toString('ascii', 12, 16), 'IHDR');
  assert.equal(png.readUInt32BE(16), 2048);
  assert.equal(png.readUInt32BE(20), 2048);
});

test('release retains upstream artwork attribution and keeps it separate from the code MIT license', async () => {
  const license = await readFile(projectFile('src/local-assets/YunYueSama-LICENSE.txt'), 'utf8');
  const assetLicense = await readFile(projectFile('src/local-assets/YunYueSama-ASSET_LICENSE.md'), 'utf8');
  for (const document of [license, assetLicense]) {
    assert.match(document, /作者：\s*YunYueSama/);
    assert.ok(document.includes(upstream), 'both upstream license files must retain the original repository');
    assert.match(document, /大肥鱼项目署名许可\s*1\.0/);
  }
  assert.match(license, /非标准\s*MIT/);
  assert.match(license, /第三方/);
  assert.match(assetLicense, /不授予[\s\S]*第三方/);
  const packageJson = JSON.parse(await readFile(projectFile('package.json'), 'utf8'));
  assert.equal(packageJson.license, 'MIT');
  const codeLicense = await readFile(projectFile('LICENSE'), 'utf8');
  assert.match(codeLicense, /MIT License/);
  assert.match(codeLicense, /Permission is hereby granted/);
  const notices = [codeLicense, await readFile(projectFile('README.md'), 'utf8'), await readFile(projectFile('ASSET_SOURCES.md'), 'utf8')].join('\n');
  assert.match(notices, /(?:代码|源码|source code|software code)[\s\S]{0,100}\bMIT\b/i);
  assert.match(notices, /(?:图片|美术|角色素材|third[- ]party (?:artwork|assets|image))[\s\S]{0,200}(?:大肥鱼项目署名许可|YunYueSama-LICENSE\.txt)/i);
  assert.ok(notices.includes('YunYueSama-LICENSE.txt'));
  assert.ok(notices.includes('YunYueSama-ASSET_LICENSE.md'));
});

test('local HTTP serves the exact bundled PNG and never exposes or reads private credentials', async t => {
  let credentialCalls = 0, upstreamCalls = 0;
  const noCredentials = () => { credentialCalls++; throw new Error('this static-file test must not access credentials'); };
  const server = createAppServer({
    credentialStore: { status: noCredentials, save: noCredentials, remove: noCredentials, resolve: noCredentials },
    fetchImpl: async () => { upstreamCalls++; throw new Error('this release test must not call a paid API'); }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const response = await fetch(origin + assetPath);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/png');
  const served = Buffer.from(await response.arrayBuffer());
  assert.equal(sha256(served), assetHash);
  assert.equal(Number(response.headers.get('content-length')), served.length);
  for (const privatePath of ['/credentials.json', '/.french-shell/credentials.json', '/src/credentials.json']) {
    const privateResponse = await fetch(origin + privatePath);
    assert.equal(privateResponse.status, 404, privatePath + ' must not be publicly served');
    await privateResponse.arrayBuffer();
  }
  assert.equal(credentialCalls, 0);
  assert.equal(upstreamCalls, 0);
});
