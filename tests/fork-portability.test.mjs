import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveHomeContext, validateHomeConfig } from '../src/home.js';
import { homeDescriptorAsset } from '../tools/home-descriptor.mjs';
import { validateHomeDescriptor } from '../src/home-protocol.js';
import { socialMetadata } from '../tools/social-metadata.mjs';

const upstream = JSON.parse(readFileSync(new URL('./fixtures/reference-home.json', import.meta.url)));
const revision = 'b'.repeat(40), now = Date.parse('2026-10-01T00:00:00Z');
const cases = [
  ['mzbacd/dots', 'main', 'https://mzbacd.github.io/dots/'],
  ['mzbacd/renamed-home', 'main', 'https://mzbacd.github.io/renamed-home/'],
  ['mzbacd/mzbacd.github.io', 'main', 'https://mzbacd.github.io/'],
  ['mzbacd/dots', 'home/v2', 'https://mzbacd.github.io/dots/'],
];

for (const [repository, branch, pagesURL] of cases) {
  test(`configured ${repository} on ${branch} retains only its own feed, metadata and review routes`, () => {
    const settings = validateHomeConfig({ ...upstream, ownerRepository: repository,
      name: 'dot Test Home', description: 'Same-owner second-account integration test', characterPalette: 'seafoam',
      status: { branch, path: 'public/status.json' } });
    const deployment = new URL(pagesURL);
    const runtime = { repository, hostname: deployment.hostname, pathname: deployment.pathname, baseUrl: './', now };
    const home = resolveHomeContext(settings, runtime);
    assert.equal(home.mode, 'live');
    assert.equal(home.statusUrl, `https://raw.githubusercontent.com/${repository}/${branch}/public/status.json?v=${Math.floor(now / 30000)}`);
    assert.equal(home.links.repository, `https://github.com/${repository}`);
    assert.equal(home.links.contribute, `https://github.com/${repository}/blob/${branch}/CONTRIBUTING.md`);
    assert.equal(home.links.invite, `https://github.com/${repository}/issues/new?template=invitation.yml`);
    const asset = homeDescriptorAsset(settings, { GITHUB_REPOSITORY: repository, GITHUB_SHA: revision });
    assert.ok(asset);
    const descriptor = validateHomeDescriptor(JSON.parse(asset.source));
    assert.equal(descriptor.repository, repository);
    assert.equal(descriptor.revision, revision);
    assert.equal(descriptor.routes.pages, pagesURL);
    assert.equal(descriptor.routes.invitation, home.links.invite);
    const tags = Object.fromEntries(socialMetadata(settings, repository).map(tag => [tag.attrs.property || tag.attrs.name, tag.attrs.content]));
    assert.equal(tags['og:url'], pagesURL);
    assert.equal(tags['og:image'], pagesURL + 'assets/workshop-preview.png');
    assert.equal(tags['og:title'], 'dot Test Home • a little workshop');

    // A copied upstream configuration is still closed at the fork deployment.
    const copied = resolveHomeContext(upstream, runtime);
    assert.equal(copied.mode, 'new-home');
    assert.equal(copied.reason, 'repository-mismatch');
    assert.equal(copied.statusUrl, null);
    assert.equal(homeDescriptorAsset(upstream, { GITHUB_REPOSITORY: repository, GITHUB_SHA: revision }), null);
    assert.deepEqual(socialMetadata(upstream, repository), []);
    // Even a correctly edited config cannot substitute for the build identity.
    const wrongBuild = resolveHomeContext(settings, { ...runtime, repository: upstream.ownerRepository });
    assert.equal(wrongBuild.mode, 'new-home');
    assert.equal(wrongBuild.statusUrl, null);
    assert.equal(wrongBuild.links, null);
  });
}
