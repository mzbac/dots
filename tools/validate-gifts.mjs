#!/usr/bin/env node
/** Trusted validator: reads bounded JSON only; never imports contributor code. */
import { constants } from 'node:fs';
import { lstat, open, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GIFT_LIMITS, GiftValidationError, parseGiftJson, parseWorldJson,
  validateWorld, validateGiftPath,
} from '../src/gifts.js';

const REPOSITORY_ROOT = fileURLToPath(new URL('..', import.meta.url));
function fail(message) { throw new GiftValidationError(message); }
function safeInputPath(filePath) {
  if (typeof filePath !== 'string' || !filePath || /[\x00-\x1f\x7f\\%?#]/u.test(filePath) || filePath.includes('://') || filePath.startsWith('//')) fail('Invalid JSON file path');
  if (filePath.split('/').some(part => part === '.' || part === '..')) fail('Path traversal is not allowed');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*\.json$/u.test(path.basename(filePath))) fail('Only lowercase-slug .json files are allowed');
  return path.resolve(filePath);
}
async function checkPathComponents(absolutePath) {
  let current = path.parse(absolutePath).root;
  const parts = absolutePath.slice(current.length).split(path.sep).filter(Boolean);
  for (let i = 0; i < parts.length; i++) {
    current = path.join(current, parts[i]);
    const info = await lstat(current);
    if (info.isSymbolicLink()) fail('Symlinks are not allowed in JSON file paths');
    if (i < parts.length - 1 && !info.isDirectory()) fail('JSON parent must be a directory');
    if (i === parts.length - 1 && !info.isFile()) fail('JSON input must be a regular file');
  }
}
/** Read at most 64 KiB + 1, reject symlink components, UTF-8 errors and races. */
export async function readBoundedJson(filePath, { baseDir } = {}) {
  const absolutePath = safeInputPath(filePath);
  if (baseDir) {
    const relative = path.relative(path.resolve(baseDir), absolutePath);
    if (!relative || relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) fail('JSON path escapes its trusted base directory');
  }
  await checkPathComponents(absolutePath);
  // O_NOFOLLOW closes the leaf symlink race; O_NONBLOCK avoids hanging on a
  // replaced FIFO. No process is spawned and no contributor module is loaded.
  const handle = await open(absolutePath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const before = await handle.stat();
    if (!before.isFile()) fail('JSON input must be a regular file');
    if (before.size > GIFT_LIMITS.bytes) fail('JSON exceeds the 64 KiB byte limit');
    const bytes = Buffer.alloc(GIFT_LIMITS.bytes + 1);
    let length = 0;
    while (length < bytes.length) {
      const chunk = await handle.read(bytes, length, bytes.length - length, length);
      if (!chunk.bytesRead) break;
      length += chunk.bytesRead;
    }
    if (length > GIFT_LIMITS.bytes) fail('JSON exceeds the 64 KiB byte limit');
    const after = await handle.stat();
    if (before.size !== length || after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs) fail('JSON changed while it was being read');
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, length)); }
    catch { fail('JSON must be valid UTF-8'); }
  } finally { await handle.close(); }
}

/** Validate one proposed file against the trusted, currently empty preview slot. */
export async function validateGiftFile(filePath, root = REPOSITORY_ROOT) {
  const gift = parseGiftJson(await readBoundedJson(filePath));
  if (path.basename(filePath) !== `${gift.id}.json`) fail('Gift filename must match its id');
  const manifest = parseWorldJson(await readBoundedJson(path.join(root, 'community/world.json'), { baseDir: root }));
  const slot = manifest.slots.find(slot => slot.id === 'open-plot');
  if (!slot || manifest.accepted.some(entry => entry.slot === slot.id)) fail('No empty trusted preview slot is available');
  if (gift.size.some((dimension, axis) => dimension > slot.size[axis])) fail('Gift does not fit the open-plot preview slot');
  return { gift, slot };
}

/** Validate all JSON declarations and then resolve only the accepted registry. */
export async function validateRepository(root = REPOSITORY_ROOT) {
  const manifestPath = path.join(root, 'community/world.json');
  const manifest = parseWorldJson(await readBoundedJson(manifestPath, { baseDir: root }));
  const directory = path.join(root, 'community/gifts');
  // A symlink directory may expose outside files even when entries appear normal.
  const dirInfo = await lstat(directory);
  if (dirInfo.isSymbolicLink() || !dirInfo.isDirectory()) fail('Gift directory must be a real directory');
  const files = await readdir(directory, { withFileTypes: true });
  const all = new Map();
  const ids = new Set();
  for (const file of files) {
    const relative = validateGiftPath(`community/gifts/${file.name}`);
    if (file.isSymbolicLink() || !file.isFile()) fail('Gift inputs must be regular JSON files, never symlinks or directories');
    const gift = parseGiftJson(await readBoundedJson(path.join(root, relative), { baseDir: root }));
    if (ids.has(gift.id)) fail('Duplicate gift id');
    ids.add(gift.id);
    if (relative !== `community/gifts/${gift.id}.json`) fail('Gift file path must match its id');
    all.set(relative, gift);
  }
  const accepted = new Map();
  for (const entry of manifest.accepted) {
    if (!all.has(entry.path)) fail('Accepted registry references a missing JSON file');
    accepted.set(entry.path, all.get(entry.path));
  }
  const world = validateWorld(manifest, accepted);
  return { world, checkedFiles: all.size };
}

async function main(args) {
  if (args.length === 0) {
    const { world, checkedFiles } = await validateRepository();
    process.stdout.write(`Valid community: ${checkedFiles} JSON gift(s), ${world.placements.length} accepted placement(s), ${world.totalBlocks} visible box(es), ${world.emptySlots.length} empty slot(s).\n`);
  } else if (args.length === 2 && args[0] === '--gift') {
    const { gift, slot } = await validateGiftFile(args[1]);
    process.stdout.write(`Valid gift ${gift.id}: ${gift.blocks.length} box(es), size ${gift.size.join(' × ')} grid units; fits ${slot.id}. Validation only; no contributor code or assets executed.\n`);
  } else fail('Usage: node tools/validate-gifts.mjs [--gift path/to/gift.json]');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => {
    // Avoid printing attacker-controlled file content, stack traces or markup.
    process.stderr.write(`Gift validation failed: ${error instanceof GiftValidationError ? error.message : 'Unable to read the local JSON input'}.\n`);
    process.exitCode = 1;
  });
}
