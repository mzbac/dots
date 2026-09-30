#!/usr/bin/env node
/** Run this trusted script from the owner's trusted checkout, not contributor
 * code. All imported files are isolated JSON. There is no transport or writer. */
import path from 'node:path';
import { lstat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { readBoundedJson } from './validate-gifts.mjs';
import { giftPreviewSvg } from './preview-gift.mjs';
import { parseGiftJson, parseWorldJson, GiftValidationError } from '../src/gifts.js';
import { HOME_PACKET_LIMITS, validateHomePacket, validateHomePacketSourceEvidence } from '../src/home-packet.js';
import {
  HomeProtocolError, HOME_PROTOCOL_LIMITS, parseHomeProtocolJson, createHomeDescriptor,
  validateHomeDescriptor, createHomeReviewLedger, reviewHomeExchange, recordHomeOwnerDecision, homeProtocolFingerprint,
} from '../src/home-protocol.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
function fail(message) { throw new HomeProtocolError(message); }
function localDirectory(input) {
  if (typeof input !== 'string' || !input || /[\x00-\x1f\x7f\\%?#:]/u.test(input) || input.includes('://') || input.startsWith('//') || input.split('/').some(p => p === '.' || p === '..')) fail('Use an explicit local directory without traversal or URLs');
  return path.resolve(input);
}
async function readJson(file, baseDir, maxBytes) {
  return parseHomeProtocolJson(await readBoundedJson(file, { baseDir }), maxBytes);
}
/** Fixed peer.json/exchange.json names; neither may select local files, imports,
 * output paths, repository state, authorization, network targets, or a ledger.
 * The trusted root and optional owner ledger are separate explicit arguments.
 * Returns only inert JSON + script-free SVG text; never changes files. */
export async function reviewHomeEnvelopeFiles({ inputDirectory = null, packetPath = null, sourceEvidencePath = null, trustedRoot = ROOT, repository, revision, ledgerPath = null,
  decision = null, expectedReviewFingerprint = null, now = Date.now() }) {
  if ((inputDirectory === null) === (packetPath === null)) fail('Choose exactly one isolated input directory or packet file');
  if (sourceEvidencePath !== null && packetPath === null) fail('Source evidence requires packet mode');
  const packetFile = packetPath === null ? null : localDirectory(packetPath);
  const input = packetFile === null ? localDirectory(inputDirectory) : path.dirname(packetFile);
  const root = localDirectory(trustedRoot);
  // The entire source tree must stay isolated from the owner checkout.
  const relative = path.relative(root, input), inverse = path.relative(input, root);
  const nested = value => value === '' || (!value.startsWith(`..${path.sep}`) && value !== '..' && !path.isAbsolute(value));
  if (nested(relative) || nested(inverse)) fail('Keep imported exchange data in a separate directory outside the trusted checkout');
  for (const directory of [input, root]) {
    const info = await lstat(directory);
    if (!info.isDirectory() || info.isSymbolicLink()) fail('Review directories must be real directories, never symlinks');
  }
  const config = await readJson(path.join(root, 'home.json'), root, HOME_PROTOCOL_LIMITS.descriptorBytes);
  const ownerDescriptor = createHomeDescriptor(config, { repository, revision });
  if (!ownerDescriptor) fail('Build repository does not own this home; copied fork settings cannot authorize review');
  let peerDescriptor, messages, packetReview = null, reviewContextFingerprint = null;
  if (packetFile !== null) {
    const validated = await validateHomePacket(await readJson(packetFile, input, HOME_PACKET_LIMITS.bytes), { ownerDescriptor, now });
    const sourceEvidence = sourceEvidencePath === null ? null : await validateHomePacketSourceEvidence(
      await readJson(localDirectory(sourceEvidencePath), input, HOME_PROTOCOL_LIMITS.descriptorBytes), { packet: validated.packet, ownerDescriptor });
    const packetFingerprint = await homeProtocolFingerprint(validated.packet);
    const sourceEvidenceFingerprint = sourceEvidence === null ? null : await homeProtocolFingerprint(sourceEvidence);
    const attributionFingerprint = await homeProtocolFingerprint(validated.attribution);
    // Never trust an imported review-context hash: derive it from all validated
    // packet/provenance and receipt data inspected by this trusted process.
    reviewContextFingerprint = await homeProtocolFingerprint({ packetFingerprint, sourceEvidenceFingerprint, attributionFingerprint });
    packetReview = { packetFingerprint, provenance: validated.packet.provenance ?? [], attribution: validated.attribution,
      sourceEvidence, sourceEvidenceFingerprint, reviewContextFingerprint, identityAuthenticated: false, publicationAuthorized: false };
    peerDescriptor = validated.packet.peer; messages = validated.packet.envelopes;
  } else {
    peerDescriptor = validateHomeDescriptor(await readJson(path.join(input, 'peer.json'), input, HOME_PROTOCOL_LIMITS.descriptorBytes));
    messages = await readJson(path.join(input, 'exchange.json'), input);
  }
  const world = parseWorldJson(await readBoundedJson(path.join(root, 'community/world.json'), { baseDir: root }));
  const registry = new Map();
  // The trusted world controls which files can be read. validateWorld validates
  // filename, bounds, slot limits and all accepted geometry again in the reviewer.
  for (const accepted of world.accepted) {
    registry.set(accepted.path, parseGiftJson(await readBoundedJson(path.join(root, accepted.path), { baseDir: root })));
  }
  let ledger = createHomeReviewLedger(ownerDescriptor.repository);
  if (ledgerPath !== null) {
    const absolute = path.resolve(ledgerPath);
    if (nested(path.relative(input, absolute))) fail('The owner ledger cannot come from the imported data directory');
    ledger = await readJson(ledgerPath);
  }
  const result = await reviewHomeExchange({ ownerDescriptor, peerDescriptor, messages, world, giftsByPath: registry, ledger, reviewContextFingerprint, now });
  const artifact = { ...result, previewSvg: giftPreviewSvg(result.review.preview.gift),
    notice: 'Local static-gift review only. Home identities and creator labels are unverified. No message was sent, gift installed, file changed, merge performed, or publication authorized.' };
  if (packetReview !== null) artifact.packetReview = packetReview;
  if (decision !== null) {
    const decided = await recordHomeOwnerDecision(result.review, { decision, expectedReviewFingerprint, now });
    artifact.decision = decided.decision;
    artifact.acknowledgement = decided.acknowledgement;
    artifact.nextLedger = decided.nextLedger;
  } else if (expectedReviewFingerprint !== null) fail('An expected review fingerprint requires an explicit local decision');
  return artifact;
}
function argumentsFor(args) {
  const allowed = new Set(['--input', '--packet', '--source-evidence', '--home-root', '--repository', '--revision', '--ledger', '--now', '--decision', '--expect']);
  const options = new Map();
  for (let i = 0; i < args.length; i += 2) {
    if (!allowed.has(args[i]) || !args[i + 1] || options.has(args[i])) fail('Invalid or repeated CLI option');
    options.set(args[i], args[i + 1]);
  }
  if (options.has('--input') === options.has('--packet') || !options.has('--repository') || !options.has('--revision')) fail('Usage: node tools/review-home-envelope.mjs (--input /isolated/data | --packet /isolated/home-packet.json) [--source-evidence /isolated/source-evidence.json] --repository owner/repo --revision FULL_COMMIT [--home-root /trusted/home] [--ledger /owner/ledger.json] [--now UTC_TIMESTAMP] [--decision accept|decline --expect REVIEW_FINGERPRINT]');
  let now = Date.now();
  if (options.has('--now')) {
    const value = options.get('--now');
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().replace('.000Z', 'Z') !== value) fail('Use a valid UTC review time with whole seconds');
    now = Date.parse(value);
  }
  return { inputDirectory: options.get('--input') ?? null, packetPath: options.get('--packet') ?? null, sourceEvidencePath: options.get('--source-evidence') ?? null, trustedRoot: options.get('--home-root') ?? ROOT,
    repository: options.get('--repository'), revision: options.get('--revision'), ledgerPath: options.get('--ledger') ?? null,
    decision: options.get('--decision') ?? null, expectedReviewFingerprint: options.get('--expect') ?? null, now };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(`${JSON.stringify(await reviewHomeEnvelopeFiles(argumentsFor(process.argv.slice(2))), null, 2)}\n`); }
  catch (error) {
    process.stderr.write(`Home review failed: ${error instanceof HomeProtocolError || error instanceof GiftValidationError ? error.message : 'Unable to read the isolated local JSON inputs'}.\n`);
    process.exitCode = 1;
  }
}
