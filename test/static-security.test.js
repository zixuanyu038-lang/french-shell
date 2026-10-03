import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, unlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAppServer } from '../server.mjs';

const sourceDirectory = fileURLToPath(new URL('../src/', import.meta.url));
const temporaryDirectory = tmpdir();
const publicMarker = 'static-test-public-content';
const privateMarker = 'static-test-only-private-content';

function assertChild(directory, target) {
  const relative = path.relative(directory, target);
  assert.ok(relative && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative));
}
async function fixtures(t) {
  const directory = await mkdtemp(path.join(sourceDirectory, '.static-security-'));
  const outside = await mkdtemp(path.join(temporaryDirectory, 'french-shell-static-security-'));
  const links = [];
  assertChild(sourceDirectory, directory);
  assertChild(temporaryDirectory, outside);
  t.after(async () => {
    // Unlink junctions before removing the exact, validated fixture directories.
    for (const link of links) await unlink(link).catch(error => { if (error.code !== 'ENOENT') throw error; });
    assertChild(sourceDirectory, directory);
    assertChild(temporaryDirectory, outside);
    await rm(directory, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  });
  const url = file => '/src/' + path.relative(sourceDirectory, file).split(path.sep).map(encodeURIComponent).join('/');
  return { directory, outside, links, url };
}
async function linkedFile(t, fixture, target, name = 'alias') {
  const fileLink = path.join(fixture.directory, name + '.js');
  try {
    await symlink(target, fileLink, 'file');
    fixture.links.push(fileLink);
    return fileLink;
  } catch (error) {
    if (process.platform !== 'win32' || !['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) throw error;
    // Directory junctions do not require Windows Developer Mode/file-link privileges.
    const directoryLink = path.join(fixture.directory, name + '-junction');
    try {
      await symlink(path.dirname(target), directoryLink, 'junction');
      fixture.links.push(directoryLink);
      return path.join(directoryLink, path.basename(target));
    } catch (junctionError) {
      if (!['EPERM', 'EACCES', 'ENOTSUP'].includes(junctionError.code)) throw junctionError;
      t.skip('Neither file symlinks nor directory junctions are available (' + junctionError.code + ').');
      return null;
    }
  }
}
async function start(t, fixture, options = {}) {
  let credentialCalls = 0, upstreamCalls = 0;
  const noCredentials = () => { credentialCalls++; throw new Error('Static requests must not read credentials.'); };
  const server = createAppServer({
    credentialFile: path.join(fixture.outside, 'unused-credentials.json'),
    credentialStore: { status: noCredentials, save: noCredentials, remove: noCredentials, resolve: noCredentials },
    fetchImpl: async () => { upstreamCalls++; throw new Error('Static requests must not call a provider.'); },
    ...options
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  t.after(() => { assert.equal(credentialCalls, 0); assert.equal(upstreamCalls, 0); });
  return 'http://127.0.0.1:' + server.address().port;
}
async function denied(base, url) {
  for (const method of ['GET', 'HEAD']) {
    const response = await fetch(base + url, { method });
    assert.equal(response.status, 404, method + ' must deny this static path.');
    assert.ok(!(await response.text()).includes(privateMarker));
  }
}

test('static realpath rejects a file symlink or Windows junction targeting a temporary external JS file', async t => {
  const fixture = await fixtures(t);
  const target = path.join(fixture.outside, 'outside.js');
  await writeFile(target, privateMarker);
  const link = await linkedFile(t, fixture, target);
  if (!link) return;
  const base = await start(t, fixture);
  await denied(base, fixture.url(link));
  const response = await fetch(base + '/src/app.js');
  assert.equal(response.status, 200);
  await response.arrayBuffer();
});

test('static realpath allows ordinary assets and an internal link while keeping the real MIME type', async t => {
  const fixture = await fixtures(t);
  const targets = path.join(fixture.directory, 'targets');
  await mkdir(targets);
  const target = path.join(targets, 'public.js');
  await writeFile(target, publicMarker);
  const link = await linkedFile(t, fixture, target);
  if (!link) return;
  const base = await start(t, fixture);
  for (const url of ['/', '/index.html', fixture.url(target), fixture.url(link)]) {
    const response = await fetch(base + url);
    assert.equal(response.status, 200);
    const text = await response.text();
    if (url.startsWith('/src/')) { assert.equal(text, publicMarker); assert.equal(response.headers.get('content-type'), 'text/javascript; charset=utf-8'); }
  }
});

test('Windows directory junctions cannot expose temporary files outside the project', { skip: process.platform !== 'win32' }, async t => {
  const fixture = await fixtures(t);
  const target = path.join(fixture.outside, 'outside.js');
  await writeFile(target, privateMarker);
  const junction = path.join(fixture.directory, 'outside-junction');
  try { await symlink(fixture.outside, junction, 'junction'); }
  catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) { t.skip('Directory junctions are unavailable (' + error.code + ').'); return; }
    throw error;
  }
  fixture.links.push(junction);
  const base = await start(t, fixture);
  await denied(base, fixture.url(path.join(junction, 'outside.js')));
});

test('configured private files under src cannot be served directly or through an internal alias', async t => {
  const fixture = await fixtures(t);
  const targets = path.join(fixture.directory, 'targets');
  await mkdir(targets);
  const target = path.join(targets, 'private.js');
  await writeFile(target, privateMarker);
  const base = await start(t, fixture, { credentialFile: target });
  await denied(base, fixture.url(target));
  const link = await linkedFile(t, fixture, target);
  if (link) await denied(base, fixture.url(link));
});

test('the environment-configured credential location is excluded even when its extension is public', async t => {
  const fixture = await fixtures(t);
  const target = path.join(fixture.directory, 'environment-private.js');
  await writeFile(target, privateMarker);
  const previous = process.env.FRENCH_SHELL_CREDENTIAL_FILE;
  let base;
  try {
    process.env.FRENCH_SHELL_CREDENTIAL_FILE = target;
    base = await start(t, fixture, { credentialFile: undefined });
  } finally {
    if (previous === undefined) delete process.env.FRENCH_SHELL_CREDENTIAL_FILE;
    else process.env.FRENCH_SHELL_CREDENTIAL_FILE = previous;
  }
  await denied(base, fixture.url(target));
});

test('an injected credential store filePath is excluded even with an otherwise public extension', async t => {
  const fixture = await fixtures(t);
  const target = path.join(fixture.directory, 'private.html');
  await writeFile(target, privateMarker);
  const noCredentials = () => { throw new Error('A static request must never access this test store.'); };
  const base = await start(t, fixture, { credentialStore: { filePath: target, status: noCredentials, save: noCredentials, remove: noCredentials, resolve: noCredentials } });
  await denied(base, fixture.url(target));
});

test('configured credential aliases outside src still protect their real target within src', async t => {
  const fixture = await fixtures(t);
  const targets = path.join(fixture.directory, 'targets');
  await mkdir(targets);
  const target = path.join(targets, 'private.js');
  await writeFile(target, privateMarker);
  const externalAlias = { ...fixture, directory: fixture.outside };
  const link = await linkedFile(t, externalAlias, target, 'configured-private');
  if (!link) return;
  const base = await start(t, fixture, { credentialFile: link });
  await denied(base, fixture.url(target));
});

test('real target extensions remain restricted, so a JS-named link cannot expose JSON content', async t => {
  const fixture = await fixtures(t);
  const target = path.join(fixture.directory, 'private.json');
  await writeFile(target, privateMarker);
  const link = path.join(fixture.directory, 'disguised.js');
  try { await symlink(target, link, 'file'); }
  catch (error) {
    if (process.platform === 'win32' && ['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) { t.skip('This filename-disguise test requires file symlink privileges (' + error.code + ').'); return; }
    throw error;
  }
  fixture.links.push(link);
  const base = await start(t, fixture);
  await denied(base, fixture.url(link));
});
