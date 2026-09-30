#!/usr/bin/env node
/** Run only from a trusted owner checkout. Read selected own-repository JSON;
 * never check out a branch, execute contributor code, write files, or send data. */
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readBoundedJson } from './validate-gifts.mjs';
import {
  HomeProtocolError, HOME_PROTOCOL_LIMITS, parseHomeProtocolJson,
  createHomeDescriptor, validateHomeDescriptor, homeProtocolFingerprint,
} from '../src/home-protocol.js';
import {
  HOME_PACKET_LIMITS, HOME_PACKET_PROPOSAL_PATH, extractHomePacketBlock,
  parseHomePacketJson, validateHomePacket, validateHomePacketSourceEvidence,
} from '../src/home-packet.js';

export const HOME_PACKET_IMPORT_LIMITS = Object.freeze({ responseBytes: 64 * 1024, reportBytes: 64 * 1024, requests: 10, timeoutMs: 15000 });
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SHA = /^[0-9a-f]{40}$/u;
const positive = value => Number.isSafeInteger(value) && value > 0;
const digest = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
function fail(message) { throw new HomeProtocolError(message); }
function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(value) ||
      !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().replace('.000Z', 'Z') !== value) fail('Invalid source revision timestamp');
  return value;
}
function record(value) {
  if (!value || !positive(value.id) || typeof value.node_id !== 'string' || !/^[A-Za-z0-9_+=/-]{1,128}$/u.test(value.node_id)) fail('Invalid source record identity');
  if (value.body !== null && typeof value.body !== 'string') fail('Invalid source body');
  const body = value.body ?? '';
  if (body.length > HOME_PROTOCOL_LIMITS.bytes || Buffer.byteLength(body, 'utf8') > HOME_PROTOCOL_LIMITS.bytes) fail('Source body exceeds byte limit');
  return { id: value.id, nodeId: value.node_id, updatedAt: timestamp(value.updated_at), bodyFingerprint: digest(Buffer.from(body, 'utf8')) };
}
function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
/** Transport is injectable for offline tests. It is trusted infrastructure,
 * never loaded or selected by the packet. Every endpoint is locally derived. */
export async function importHomePacket({ ownerDescriptor, repository, itemType, itemNumber, source = 'body',
  commentId = null, now = Date.now(), transport = globalThis.fetch } = {}) {
  const owner = validateHomeDescriptor(ownerDescriptor);
  if (repository !== owner.repository) fail('Only the explicitly configured owner repository may be read');
  if (!['issue', 'pull-request'].includes(itemType) || !positive(itemNumber) || itemNumber > 999999999) fail('Select an explicit issue or pull-request number');
  if (!['body', 'comment', 'file'].includes(source) || (source === 'file' && itemType !== 'pull-request')) fail('Unsupported packet source');
  if (source === 'comment' ? !positive(commentId) : commentId !== null) fail('Select exactly one explicit comment only for a comment source');
  if (!Number.isSafeInteger(now) || now < 0 || typeof transport !== 'function') fail('Invalid read context');
  const observedAt = new Date(now).toISOString().replace(/\.\d{3}Z$/u, 'Z');
  const api = `https://api.github.com/repos/${repository}/`;
  const web = `https://github.com/${repository}/`;
  let requests = 0;
  async function get(route) {
    // Routes are constructed below from validated integers and hex identities.
    if (!/^(?:(?:issues|pulls)\/[1-9]\d*(?:\/files\?per_page=100)?|issues\/comments\/[1-9]\d*|git\/(?:commits|trees|blobs)\/[0-9a-f]{40})$/u.test(route)) fail('Undeclared GitHub read endpoint');
    if (++requests > HOME_PACKET_IMPORT_LIMITS.requests) fail('GitHub request budget exceeded');
    const url = `${api}${route}`, controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HOME_PACKET_IMPORT_LIMITS.timeoutMs);
    let reader;
    try {
      const response = await transport(url, { method: 'GET', redirect: 'error', credentials: 'omit',
        headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, signal: controller.signal });
      if (!response || response.redirected || response.url !== url) fail('GitHub read failed or redirected');
      if (response.status !== 200) {
        if (response.status === 404 && route.startsWith('git/')) fail('Pinned PR object is unavailable through the owner repository; no foreign repository was fetched. Supply the packet in the PR body or an explicitly selected comment instead');
        fail('GitHub read failed');
      }
      if (!/^application\/json(?:\s*;|$)/iu.test(response.headers.get('content-type') ?? '')) fail('GitHub read must return JSON');
      const contentLength = response.headers.get('content-length');
      if (contentLength !== null && (!/^\d+$/u.test(contentLength) || Number(contentLength) > HOME_PACKET_IMPORT_LIMITS.responseBytes)) fail('GitHub response exceeds byte limit');
      if (!response.body || typeof response.body.getReader !== 'function') fail('GitHub response has no bounded body');
      reader = response.body.getReader();
      const chunks = []; let length = 0;
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        if (!(chunk.value instanceof Uint8Array)) fail('Invalid GitHub response bytes');
        length += chunk.value.byteLength;
        if (length > HOME_PACKET_IMPORT_LIMITS.responseBytes) fail('GitHub response exceeds byte limit');
        chunks.push(chunk.value);
      }
      let text;
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, length)); }
      catch { fail('GitHub response must be valid UTF-8'); }
      return parseHomeProtocolJson(text);
    } catch (error) {
      if (reader) { try { await reader.cancel(); } catch { /* already closed */ } }
      if (error instanceof HomeProtocolError) throw error;
      fail('Unable to complete the bounded GitHub read');
    } finally { clearTimeout(timeout); }
  }
  const itemRoute = `${itemType === 'issue' ? 'issues' : 'pulls'}/${itemNumber}`;
  function itemSnapshot(item) {
    const revision = record(item);
    if (item.number !== itemNumber || item.state !== 'open' || item.url !== `${api}${itemRoute}` ||
        item.html_url !== `${web}${itemType === 'issue' ? 'issues' : 'pull'}/${itemNumber}`) fail('GitHub item does not match the selected owner repository');
    let headSha = null;
    if (itemType === 'pull-request') {
      if (item.base?.repo?.full_name !== repository || !SHA.test(item.head?.sha) || item.merged === true) fail('PR must target the configured owner repository and declare an exact head');
      headSha = item.head.sha;
    } else if (item.repository_url !== api.slice(0, -1) || Object.hasOwn(item, 'pull_request')) fail('Selected source is not an issue in the owner repository');
    return { revision, headSha };
  }
  function commentSnapshot(comment) {
    const revision = record(comment);
    if (comment.id !== commentId || comment.url !== `${api}issues/comments/${commentId}` ||
        comment.issue_url !== `${api}issues/${itemNumber}` ||
        comment.html_url !== `${web}${itemType === 'issue' ? 'issues' : 'pull'}/${itemNumber}#issuecomment-${commentId}`) fail('Comment is not on the explicitly selected item');
    return revision;
  }
  const firstItem = await get(itemRoute), first = itemSnapshot(firstItem);
  let packetInput, comment = null, file = null;
  if (source === 'file') {
    // The owner explicitly chooses this one known filename, never a packet URL,
    // path supplied by an API response, symlink, or executable file.
    const files = await get(`pulls/${itemNumber}/files?per_page=100`);
    if (!Array.isArray(files) || files.length >= 100 || firstItem.changed_files !== files.length) fail('PR changed-file listing must be complete and bounded');
    const proposals = files.filter(entry => entry.filename === HOME_PACKET_PROPOSAL_PATH);
    if (proposals.length !== 1 || !['added', 'modified'].includes(proposals[0].status) ||
        Object.hasOwn(proposals[0], 'previous_filename') || !SHA.test(proposals[0].sha)) fail('Expected exactly one added or modified known proposal JSON file');
    const commit = await get(`git/commits/${first.headSha}`);
    if (commit.sha !== first.headSha || !SHA.test(commit.tree?.sha)) fail('Commit does not match the pinned PR head');
    let treeSha = commit.tree.sha, entry;
    const parts = HOME_PACKET_PROPOSAL_PATH.split('/');
    for (let index = 0; index < parts.length; index++) {
      const tree = await get(`git/trees/${treeSha}`);
      if (tree.sha !== treeSha || tree.truncated !== false || !Array.isArray(tree.tree) || tree.tree.length > 256) fail('Source tree must be complete and bounded');
      const matches = tree.tree.filter(child => child.path === parts[index]);
      if (matches.length !== 1 || !SHA.test(matches[0].sha)) fail('Missing or ambiguous pinned proposal path');
      entry = matches[0];
      if (index < parts.length - 1) {
        if (entry.type !== 'tree' || entry.mode !== '040000') fail('Proposal parent must be a regular Git tree');
        treeSha = entry.sha;
      } else if (entry.type !== 'blob' || entry.mode !== '100644' || entry.sha !== proposals[0].sha) fail('Proposal must be a regular non-executable JSON blob at the exact PR head');
    }
    const blob = await get(`git/blobs/${entry.sha}`);
    if (blob.sha !== entry.sha || blob.encoding !== 'base64' || !positive(blob.size) || blob.size > HOME_PACKET_LIMITS.bytes ||
        typeof blob.content !== 'string' || !/^[A-Za-z0-9+/=\n]+$/u.test(blob.content)) fail('Invalid bounded proposal blob');
    const encoded = blob.content.replace(/\n/gu, '');
    const bytes = Buffer.from(encoded, 'base64');
    if (bytes.length !== blob.size || bytes.toString('base64') !== encoded || (entry.size !== undefined && entry.size !== bytes.length) ||
        createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex') !== entry.sha) fail('Blob bytes do not match the immutable Git identity');
    let sourceText;
    try { sourceText = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch { fail('Proposal blob must be valid UTF-8'); }
    packetInput = parseHomePacketJson(sourceText);
    file = { path: HOME_PACKET_PROPOSAL_PATH, commitSha: first.headSha, rootTreeSha: commit.tree.sha,
      blobSha: entry.sha, byteLength: bytes.length, contentFingerprint: digest(bytes), mode: '100644' };
  } else if (source === 'comment') {
    const firstComment = await get(`issues/comments/${commentId}`);
    comment = commentSnapshot(firstComment);
    packetInput = extractHomePacketBlock(firstComment.body);
    if (!same(comment, commentSnapshot(await get(`issues/comments/${commentId}`)))) fail('Comment changed during the bounded read; discard this packet');
  } else packetInput = extractHomePacketBlock(firstItem.body);
  const checked = await validateHomePacket(packetInput, { ownerDescriptor: owner, now });
  if (!same(first, itemSnapshot(await get(itemRoute)))) fail('Item revision or PR head changed during the bounded read; discard this packet');
  const sourceEvidence = await validateHomePacketSourceEvidence({ schemaVersion: 1, kind: 'github-home-packet-read',
    repository, itemType, itemNumber, item: first.revision, source, comment, headSha: first.headSha, file,
    packetFingerprint: await homeProtocolFingerprint(checked.packet), observedAt, identityAuthenticated: false, reviewScope: 'selected-packet-only' },
  { packet: checked.packet, ownerDescriptor: owner });
  const report = { ...checked, sourceEvidence };
  if (Buffer.byteLength(JSON.stringify(report), 'utf8') > HOME_PACKET_IMPORT_LIMITS.reportBytes) fail('Import report exceeds byte limit');
  return Object.freeze(report);
}

function cliOptions(args) {
  const keys = new Set(['--home-root', '--repository', '--revision', '--type', '--number', '--source', '--comment', '--now']);
  const options = new Map();
  for (let index = 0; index < args.length; index += 2) {
    if (!keys.has(args[index]) || !args[index + 1] || options.has(args[index])) fail('Invalid or repeated import option');
    options.set(args[index], args[index + 1]);
  }
  for (const key of ['--repository', '--revision', '--type', '--number']) if (!options.has(key)) fail('Usage: node tools/import-home-packet.mjs --repository OWNER/REPO --revision FULL_COMMIT --type issue|pull-request --number NUMBER [--source body|comment|file --comment ID] [--home-root TRUSTED_ROOT] [--now UTC_TIMESTAMP]');
  if (!/^[1-9]\d{0,8}$/u.test(options.get('--number')) || (options.has('--comment') && !/^[1-9]\d{0,15}$/u.test(options.get('--comment')))) fail('Use explicit positive item and comment numbers');
  const root = options.get('--home-root') ?? ROOT;
  if (/[%?#\\\x00-\x1f\x7f]/u.test(root) || root.includes('://') || root.startsWith('//') || root.split('/').some(part => part === '.' || part === '..')) fail('Invalid trusted home root');
  return { root: path.resolve(root), repository: options.get('--repository'), revision: options.get('--revision'),
    itemType: options.get('--type'), itemNumber: Number(options.get('--number')), source: options.get('--source') ?? 'body',
    commentId: options.has('--comment') ? Number(options.get('--comment')) : null,
    now: options.has('--now') ? Date.parse(timestamp(options.get('--now'))) : Date.now() };
}
export async function importHomePacketFromCli(args, { transport = globalThis.fetch } = {}) {
  const { root, revision, ...options } = cliOptions(args);
  const config = parseHomeProtocolJson(await readBoundedJson(path.join(root, 'home.json'), { baseDir: root }), HOME_PROTOCOL_LIMITS.descriptorBytes);
  const ownerDescriptor = createHomeDescriptor(config, { repository: options.repository, revision });
  if (!ownerDescriptor) fail('The configured home is not owned by the explicitly selected repository');
  return importHomePacket({ ...options, ownerDescriptor, transport });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await importHomePacketFromCli(process.argv.slice(2));
    // The owner chooses any redirection. No filesystem writes happen here.
    process.stdout.write(`${JSON.stringify(result.packet)}\n`);
    process.stderr.write(`${JSON.stringify(result.sourceEvidence)}\n`);
  } catch (error) {
    process.stderr.write(`Packet import failed: ${error instanceof HomeProtocolError ? error.message : 'Unable to read the trusted local home configuration'}.\n`);
    process.exitCode = 1;
  }
}
