import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateRepository } from '../tools/validate-gifts.mjs';
import { createGardenArtwork, createGardenCells } from '../src/garden.js';
import { GIFT_LIMITS } from '../src/gifts.js';
import { validateNeighbors } from '../src/neighbors.js';
import * as THREE from 'three';

// Contract edge cases use reference-world.json. This separate check always reads
// the real owner-maintained registry and every accepted gift, including additions.
test('the configured garden validates and renders every accepted gift in one bounded batch', async () => {
  const { world, checkedFiles } = await validateRepository();
  assert.ok(checkedFiles >= world.placements.length);
  assert.ok(world.placements.length <= GIFT_LIMITS.instances);
  assert.ok(world.totalBlocks <= GIFT_LIMITS.visibleBlocks);
  const cells = createGardenCells(world);
  assert.ok(cells.every(cell => cell.length === 7 && cell.every(Number.isFinite)));
  assert.ok(cells.length < 650 + GIFT_LIMITS.visibleBlocks, `${cells.length} garden cells`);
  const scene = new THREE.Scene();
  const art = createGardenArtwork(scene, world);
  assert.equal(art.group.children.length, 1);
  assert.equal(art.group.children[0].isInstancedMesh, true);
  assert.equal(art.group.children[0].count, cells.length);
  assert.deepEqual(art.cells, cells);
  assert.equal(art.group.visible, false);
  art.dispose();
  assert.equal(scene.children.length, 0);
});

test('the configured neighbour list remains bounded and safe as reviewed homes are added', () => {
  const input = JSON.parse(readFileSync(new URL('../community/neighbors.json', import.meta.url), 'utf8'));
  assert.equal(validateNeighbors(input).length, input.length);
});
