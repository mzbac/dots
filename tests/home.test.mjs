import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CHARACTER_PALETTES, resolveHomeContext, validateHomeConfig } from '../src/home.js';

const configuredHome = JSON.parse(readFileSync(new URL('../home.json', import.meta.url)));
// Security scenarios deliberately model a known upstream. They must not change
// identity when a fork edits its real, public home.json.
const home = JSON.parse(readFileSync(new URL('./fixtures/reference-home.json', import.meta.url)));
const now = Date.parse('2026-09-30T10:00:00Z');
const live = { repository: 'mzbac/dots', hostname: 'mzbac.github.io', pathname: '/dots/', baseUrl: './', now };
const config = changes => ({ ...home, ...changes });
const resolve = (changes = {}, settings = home) => resolveHomeContext(settings, { ...live, ...changes });
function assertClosed(result, reason) {
  assert.equal(result.mode, 'new-home');
  assert.equal(result.statusUrl, null, 'A closed home must not fetch even a copied relative snapshot');
  if (reason) assert.equal(result.reason, reason);
}

test('checked-in config is strict, immutable, and exposes named palettes only', () => {
  const result = validateHomeConfig(configuredHome);
  assert.deepEqual(result, configuredHome);
  assert.equal(result.ownerRepository, configuredHome.ownerRepository);
  assert.deepEqual(CHARACTER_PALETTES, ['amber', 'rose', 'seafoam']);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.status));
  assert.ok(Object.isFrozen(CHARACTER_PALETTES));
  for (const characterPalette of CHARACTER_PALETTES) validateHomeConfig(config({ characterPalette }));
});

test('the actual Pages home retains its own raw status endpoint and 30-second refresh key', () => {
  const [owner, name] = configuredHome.ownerRepository.split('/');
  const hostname = `${owner.toLowerCase()}.github.io`;
  const deployment = { ...live, repository: configuredHome.ownerRepository, hostname,
    pathname: name.toLowerCase() === hostname ? '/' : `/${name}/` };
  const result = resolveHomeContext(configuredHome, deployment);
  assert.equal(result.mode, 'live');
  assert.equal(result.reason, 'verified-pages');
  assert.equal(result.statusUrl, `https://raw.githubusercontent.com/${configuredHome.ownerRepository}/${configuredHome.status.branch}/public/status.json?v=${Math.floor(now / 30000)}`);
  assert.equal(resolveHomeContext(configuredHome, { ...deployment, now: now + 30000 }).statusUrl.endsWith(`v=${Math.floor(now / 30000) + 1}`), true);
  assert.equal(result.repository, configuredHome.ownerRepository);
  assert.equal(result.links.repository, `https://github.com/${configuredHome.ownerRepository}`);
  assert.equal(result.links.contribute, `https://github.com/${configuredHome.ownerRepository}/blob/${configuredHome.status.branch}/CONTRIBUTING.md`);
  assert.ok(Object.isFrozen(result));
});

test('community destinations are derived only from a deployment-verified repository', () => {
  assert.deepEqual(resolve().links, {
    repository: 'https://github.com/mzbac/dots',
    fork: 'https://github.com/mzbac/dots/fork',
    invite: 'https://github.com/mzbac/dots/issues/new?template=invitation.yml',
    hello: 'https://github.com/mzbac/dots/issues/new?template=hello.yml',
    contribute: 'https://github.com/mzbac/dots/blob/main/CONTRIBUTING.md'
  });
  const custom = resolve({}, config({ status: { branch: 'home/v2', path: 'public/status.json' } }));
  assert.equal(custom.links.contribute, 'https://github.com/mzbac/dots/blob/home/v2/CONTRIBUTING.md');
  assert.ok(custom.statusUrl.includes('/home/v2/public/status.json?'));
  assert.ok(Object.isFrozen(custom.links));
});

test('same-owner renamed repositories do not inherit the parent mood', () => {
  const settings = { repository: 'mzbac/new-house', pathname: '/new-house/' };
  const stale = resolve(settings);
  assertClosed(stale, 'repository-mismatch');
  assert.equal(stale.repository, 'mzbac/new-house');
  assert.equal(stale.links.invite, 'https://github.com/mzbac/new-house/issues/new?template=invitation.yml');
  const configured = resolve(settings, config({ ownerRepository: 'mzbac/new-house' }));
  assert.equal(configured.mode, 'live');
  assert.match(configured.statusUrl, /^https:\/\/raw\.githubusercontent\.com\/mzbac\/new-house\/main\/public\/status\.json\?v=\d+$/);
});

test('different-owner forks with stale config never fetch upstream or copied snapshots', () => {
  const fork = { repository: 'new-dot/dots', hostname: 'new-dot.github.io' };
  const stale = resolve(fork);
  assertClosed(stale, 'repository-mismatch');
  assert.equal(stale.links.repository, 'https://github.com/new-dot/dots');
  const configured = resolve(fork, config({ ownerRepository: 'new-dot/dots', name: 'petal', characterPalette: 'rose' }));
  assert.equal(configured.mode, 'live');
  assert.ok(configured.statusUrl.startsWith('https://raw.githubusercontent.com/new-dot/dots/'));
  assert.equal(configured.home.name, 'petal');
  assert.equal(configured.home.characterPalette, 'rose');
});

test('copied build identity does not authorize a different owner or repository deployment', () => {
  for (const deployment of [
    { hostname: 'new-dot.github.io' },
    { pathname: '/new-house/' },
    { hostname: 'new-dot.github.io', pathname: '/new-house/' },
    { repository: 'new-dot/dots' }
  ]) {
    const result = resolve(deployment);
    assertClosed(result);
    assert.equal(result.links, null);
    assert.equal(result.repository, null);
  }
});

test('user.github.io repositories resolve at their own root only', () => {
  const rootHome = config({ ownerRepository: 'petal/petal.github.io' });
  const root = { repository: 'petal/petal.github.io', hostname: 'petal.github.io', pathname: '/' };
  for (const pathname of ['/', '/index.html']) {
    const result = resolve({ ...root, pathname }, rootHome);
    assert.equal(result.mode, 'live');
    assert.ok(result.statusUrl.startsWith('https://raw.githubusercontent.com/petal/petal.github.io/'));
  }
  for (const pathname of ['/dots/', '/petal.github.io/', '/INDEX.html']) {
    assertClosed(resolve({ ...root, pathname }, rootHome));
  }
  assertClosed(resolve(root), 'repository-mismatch');
});

test('GitHub identities and DNS are case-insensitive while project paths retain their real case', () => {
  assert.equal(resolve({ repository: 'MZBAC/dots', hostname: 'MZBAC.GITHUB.IO' }).mode, 'live');
  const mixed = { repository: 'MzBaC/DoTs', pathname: '/DoTs/' };
  assert.equal(resolve(mixed).mode, 'live');
  assertClosed(resolve({ ...mixed, pathname: '/dots/' }));
  assertClosed(resolve({ pathname: '/DOTS/' }));
});

test('project path ownership uses full segments and rejects traversal or alternate URL syntax', () => {
  for (const pathname of ['/dots', '/dots/', '/dots/index.html', '/dots/room/']) {
    assert.equal(resolve({ pathname }).mode, 'live');
  }
  for (const pathname of [
    '/', '/dots-copy/', '/dots.example/', '/dots2/', '/other/dots/',
    '//dots/', '/dots//room', '/dots/../other/', '/dots/./', '/dots/%2e%2e/other',
    '/dots%2fother/', '/dots/%252fother/', '/dots\\other/', '/dots/?next=x',
    '/dots/#fragment', '/dots/\u0000', 'https://mzbac.github.io/dots/', null, 42
  ]) assertClosed(resolve({ pathname }));
});

test('unknown public deployments, custom domains, missing build identities, and lookalike hosts fail closed', () => {
  for (const hostname of [
    'example.com', 'mzbac.github.io.evil.example', 'mzbac.github.io@evil.example',
    'https://mzbac.github.io', 'mzbac.github.io:443', 'mzbac.github.io.', 'github.io', '', null
  ]) {
    const result = resolve({ hostname });
    assertClosed(result);
    assert.equal(result.links, null);
  }
  for (const repository of ['', null, undefined, 'mzbac', 'mzbac/dots/extra', 'https://github.com/mzbac/dots']) {
    const result = resolve({ repository });
    assertClosed(result, 'missing-build-identity');
    assert.equal(result.links, null);
  }
  assertClosed(resolveHomeContext(home));
  assertClosed(resolveHomeContext(home, null));
});

test('local development explicitly permits a safe relative status path without publishing community identity', () => {
  for (const hostname of ['localhost', '127.0.0.1', '[::1]']) {
    const result = resolve({ repository: '', hostname, pathname: '/' });
    assert.equal(result.mode, 'local');
    assert.equal(result.reason, 'local-development');
    assert.equal(result.statusUrl, './status.json');
    assert.equal(result.links, null);
    assert.equal(result.repository, null);
  }
  for (const baseUrl of ['/', '/dots/']) {
    assert.equal(resolve({ hostname: 'localhost', baseUrl }).statusUrl, `${baseUrl}status.json`);
  }
  for (const hostname of ['localhost.example.com', '127.0.0.2', '0.0.0.0', '::1']) {
    assertClosed(resolve({ hostname }));
  }
});

test('base URLs and refresh values cannot inject requests', () => {
  for (const baseUrl of ['https://evil.example/', '//evil.example/', '../', '/dots/../', './?x=', '/x/#', '/x/%2f/', 'javascript:alert(1)', null, 4]) {
    assertClosed(resolve({ baseUrl }), 'invalid-runtime');
    assertClosed(resolve({ hostname: 'localhost', baseUrl }), 'invalid-runtime');
  }
  for (const invalidNow of [NaN, Infinity, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '0&private=secret', null]) {
    assertClosed(resolve({ now: invalidNow }), 'invalid-runtime');
  }
});

test('schema rejects malformed config, arbitrary URLs, extra fields, and injection-like display text', () => {
  const inherited = Object.create(home);
  const malformed = [null, undefined, [], 'home', inherited,
    config({ schemaVersion: '1' }), config({ schemaVersion: 2 }),
    config({ extra: true }), config({ statusUrl: 'https://evil.example/status.json' }),
    ...['', ' dot ', '<script>alert(1)</script>', 'a\nb', 'a\u202eb', 'a'.repeat(49)].map(name => config({ name })),
    config({ description: '' }), config({ description: 'a'.repeat(241) }),
    ...['#ff0000', 'constructor', '__proto__', {}, null].map(characterPalette => config({ characterPalette })),
    ...['mzbac', '../dots', 'mzbac/..', 'mzbac/.', 'mzbac/dots/extra', 'mzbac/dots?x=y',
      'mzbac/dots#fragment', 'mzbac/dots@evil', 'mzbac\\dots', 'https://github.com/mzbac/dots',
      'mzbac/dots\n', 'a'.repeat(40) + '/dots'].map(ownerRepository => config({ ownerRepository })),
    config({ status: { branch: 'main', path: 'status.json' } }),
    config({ status: { branch: 'main', path: 'https://evil.example/status.json' } }),
    config({ status: { branch: 'main', path: 'public/status.json', url: 'https://evil.example/' } }),
    ...['', '../main', 'main/../other', '/main', 'main/', 'main//other', 'main?x=1', 'main#x',
      'main\\other', 'main.lock', 'main./other', '.hidden', '-main', 'main\n'].map(branch =>
      config({ status: { branch, path: 'public/status.json' } }))
  ];
  for (const value of malformed) {
    assert.throws(() => validateHomeConfig(value));
    const result = resolveHomeContext(value, live);
    assertClosed(result, 'invalid-config');
    assert.equal(result.home, null);
    assertClosed(resolveHomeContext(value, { ...live, hostname: 'localhost' }), 'invalid-config');
  }
  const missing = { ...home };
  delete missing.name;
  assert.throws(() => validateHomeConfig(missing));
});

test('display-only customization stays separate from ownership and cannot redirect any feed', () => {
  const customized = config({ name: 'Petal & Friends 🌸', description: 'Ideas, tea, and sunshine.', characterPalette: 'seafoam' });
  assert.equal(resolve({}, customized).statusUrl, resolve().statusUrl);
  const unopened = resolve({ hostname: 'preview.example.com' }, customized);
  assertClosed(unopened);
  assert.equal(unopened.home.name, 'Petal & Friends 🌸');
});

test('Vite preserves relative assets and embeds only the build repository, never config ownership', async () => {
  const original = process.env.GITHUB_REPOSITORY;
  try {
    process.env.GITHUB_REPOSITORY = 'new-dot/new-house';
    const { default: build } = await import(`../vite.config.js?home-test=${now}`);
    assert.equal(build.base, './');
    assert.equal(build.define.__HOME_REPOSITORY__, JSON.stringify('new-dot/new-house'));
    delete process.env.GITHUB_REPOSITORY;
    const { default: local } = await import(`../vite.config.js?home-test-empty=${now}`);
    assert.equal(local.define.__HOME_REPOSITORY__, JSON.stringify(''));
  } finally {
    if (original === undefined) delete process.env.GITHUB_REPOSITORY;
    else process.env.GITHUB_REPOSITORY = original;
  }
});
