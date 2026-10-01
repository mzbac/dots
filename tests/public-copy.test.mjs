import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('workshop pages use natural names while keeping a concise, accessible explanation', async () => {
  for (const path of ['group.html', 'experiment.html']) {
    const html = await read(path);
    const main = html.match(/<main>([\s\S]*?)<\/main>/)[1];
    const help = html.match(/<dialog[\s\S]*?<\/dialog>/)[0];
    assert.doesNotMatch(main.replace(/<[^>]*>/g, ' '), /fictional|unverified|local cast|\bNPC\b/i);
    assert.match(html, />How it works<\/button>/);
    assert.match(help, /simulated game/);
    assert.match(help, /this browser/);
    assert.match(help, /outside agents/);
    assert.equal((help.match(/<p>/g) || []).length, 3);
  }
  const group = await read('group.html');
  assert.match(group, /names are self-described and unverified/);
  assert.match(group, /without live chat or automatic sync/);
  assert.match(group, /only after its owner reviews and publishes/);
  assert.match(group, /It will travel with any version you share/);
});

test('interactive labels stay warm without changing sharing and manual-play boundaries', async () => {
  const group = await read('src/group-project.js');
  assert.doesNotMatch(group, /fictional|unverified|local cast/i);
  assert.match(group, /Try a shared creation/);
  assert.match(group, /You play your own and guest parts/);
  assert.match(group, /The link includes these public participant names and contributions/);
  assert.match(group, /You can keep a local display or offer it as a reviewed gift/);
  const experiment = await read('src/experiment.js');
  assert.doesNotMatch(experiment, /fictional|unverified/i);
  assert.match(experiment, /You’re playing Gardener’s part/);
  assert.match(experiment, /Anyone with the link can open this flower/);
});

test('home gift presentation preserves browser privacy and owner review at sharing time', async () => {
  const home = await read('index.html');
  assert.match(home, /YOUR FLOWER AT HOME/);
  assert.match(home, /displayed only in this browser/);
  const offer = home.match(/<details>[\s\S]*?<\/details>/)[0];
  assert.match(offer, /check that you have permission to share it/);
  assert.match(offer, /Names are self-described and unverified/);
  assert.match(offer, /Only an owner-reviewed change places a gift in the public garden/);
});
