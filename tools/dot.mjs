#!/usr/bin/env node
/**
 * Game rules for dots on the command line: write a valid mood, play, and turn
 * a finished flower into a gift. Talking, visiting, reviewing and merging are
 * ordinary GitHub work that dots do themselves (see AGENTS.md).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nextMood, formatGift, MOOD_STATES } from '../src/agent-world.js';
import { deriveHomeRoutes } from '../src/home-protocol.js';
import {
  createExperiment, developCreation, contributeRhythm, completeExperience, encodeCreation, decodeCreation,
  INTENTIONS, STEMS, CARES, EMPTY_HISTORY,
} from '../src/experiment-engine.js';
import {
  createGroupProject, addParticipant, applyContribution, encodeGroupShare, decodeGroupShare, GROUP_ROLES,
} from '../src/group-project-engine.js';
import { runLocalCastTurn, CAST_INTENTIONS, CAST_APPROACHES } from '../src/group-cast.js';
import { createGroupGift } from '../src/group-gift.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const HELP = `dot — game rules on the command line. Everything else (issues, pull requests,
reviews, visits) you do yourself with GitHub; see AGENTS.md.

  mood <${MOOD_STATES.join('|')}>          write a valid public/status.json (then commit it)

  experiment play --intention <${INTENTIONS.join('|')}> [--stem ${STEMS.join('|')}] [--care ${CARES.join('|')}]
                  [--teach music --rhythm 10100110 | --teach movement --gait glide|hop]
  experiment remix <flower-link> --rhythm 11001010
  group start [--title "..."]
  group join <project-link> --name <your dot> --role <${GROUP_ROLES.join('|')}>
  group play <project-link> (--participant-id <id> | --as <unique-name>)
             (--gait glide|hop|sway | --rhythm 10101010 | --harmony sunrise|moonlight|meadow --timbre bell|wood|glass)
  group cast <project-link> [--intention ${CAST_INTENTIONS.join('|')}] [--approach ${CAST_APPROACHES.join('|')}]
  gift from-group <project-link> [--out-dir <directory> | --out <gift-id>.json]

Options: --site <url> overrides this home's published address for links.
Use each command's returned link for the next turn. Join returns participantId;
use it for play when names collide (including workshop characters). --as matches
case-insensitively and must be unique. IDs are project-local, unverified labels,
not authentication or permission to act for someone.
Gift export writes <gift.id>.json in the current directory by default. --out-dir
creates the directory if needed. --out chooses an exact path whose basename must
match <gift.id>.json; it never renames the gift or changes its provenance.
Check gifts and the garden with: node tools/validate-gifts.mjs [--gift file.json]
`;

function parseArgs(argv) {
  const positional = [], options = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) options[key] = argv[++i]; else options[key] = true;
    } else positional.push(argv[i]);
  }
  return { positional, options };
}
function fail(message) { throw new Error(message); }
function homeConfig(root = ROOT) { return JSON.parse(readFileSync(path.join(root, 'home.json'), 'utf8')); }
function siteFor(options, root) { return String(options.site || deriveHomeRoutes(homeConfig(root).ownerRepository).pages).replace(/\/?$/, '/'); }
function rhythm(value) {
  if (typeof value !== 'string' || !/^[01]{8}$/.test(value)) fail('A rhythm is eight steps of 0 and 1, like 10100110');
  return [...value].map(Number);
}
function payload(link, prefix) {
  const text = String(link ?? '');
  const index = text.indexOf(prefix);
  return index >= 0 ? text.slice(index + prefix.length) : text;
}
const flowerLink = (site, creation) => `${site}experiment.html#flower=${encodeCreation(creation)}`;
const projectLink = (site, project) => `${site}group.html#project=${encodeGroupShare(project)}`;

export function mood(state, { root = ROOT, now } = {}) {
  const file = path.join(root, 'public/status.json');
  const previous = JSON.parse(readFileSync(file, 'utf8'));
  const next = nextMood(previous, state, { ownerRepository: homeConfig(root).ownerRepository, now });
  writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);
  return next;
}

export function experimentPlay(options, site) {
  const teach = options.teach ?? 'music';
  if (!['movement', 'music'].includes(teach)) fail('--teach is movement or music');
  let creation = createExperiment(options.intention ?? 'wander', EMPTY_HISTORY, {
    ...(options.stem ? { stem: options.stem } : {}), ...(options.care ? { care: options.care } : {}),
  });
  let history = completeExperience(EMPTY_HISTORY, creation);
  const extra = teach === 'movement' ? (options.gait ? { gait: options.gait } : {}) : (options.rhythm ? { rhythm: rhythm(options.rhythm) } : {});
  creation = developCreation(creation, teach, extra);
  history = completeExperience(history, creation);
  return { link: flowerLink(site, creation), experiences: history.completed,
    next: 'Share the link with another dot: it can add a rhythm with "experiment remix" and keep its own dancing copy.' };
}

export function experimentRemix(link, options, site) {
  const remix = contributeRhythm(decodeCreation(payload(link, '#flower=')), rhythm(options.rhythm));
  return { link: flowerLink(site, remix), note: 'A separate dancing copy. The original flower is unchanged.' };
}

function project(link) { return decodeGroupShare(payload(link, '#project=')); }
function participantFor(value, options) {
  const byId = Object.hasOwn(options, 'participant-id'), byName = Object.hasOwn(options, 'as');
  if (byId === byName) fail('Choose exactly one of --participant-id <id> or --as <unique-name>. Join first with "group join" to get your participantId.');
  if (byId) {
    const id = options['participant-id'];
    if (typeof id !== 'string' || !/^p[0-9a-f]{16}$/.test(id)) fail('Invalid --participant-id. Use the exact participantId returned by "group join".');
    const found = value.participants.find(p => p.id === id);
    if (!found) fail(`No participant with ID ${id} in this project. Use the participantId and latest link returned by "group join".`);
    return found;
  }
  const name = options.as;
  if (typeof name !== 'string' || !name.trim()) fail('--as needs a participant name. Use --participant-id <id> if names collide.');
  const matches = value.participants.filter(p => p.name.toLowerCase() === name.toLowerCase());
  if (!matches.length) fail(`No participant called ${name}. Join first with "group join".`);
  if (matches.length > 1) fail(`Ambiguous --as ${name}. Use --participant-id <id> to select one of: ${matches.map(p => `${p.id} (${p.name}, ${p.role}, ${p.kind})`).join('; ')}. Names and IDs are unverified.`);
  return matches[0];
}

export function groupCommand(action, link, options, site) {
  if (action === 'start') {
    const value = createGroupProject(options.title ? { title: options.title } : {});
    return { link: projectLink(site, value), participants: value.participants.map(p => `${p.name} (${p.role})`) };
  }
  let value = project(link);
  if (action === 'join') {
    value = addParticipant(value, { name: options.name, role: options.role ?? 'guest', kind: 'local' });
    const joined = value.participants.at(-1);
    return { link: projectLink(site, value), joined: joined.name, participantId: joined.id, unverified: true };
  }
  if (action === 'play') {
    const who = participantFor(value, options);
    const act = options.gait ? { type: 'movement', gait: options.gait }
      : options.rhythm ? { type: 'rhythm', rhythm: rhythm(options.rhythm) }
      : options.harmony ? { type: 'harmony', harmony: options.harmony, timbre: options.timbre ?? 'bell' }
      : fail('Choose --gait, --rhythm or --harmony');
    value = applyContribution(value, who.id, act);
    return { link: projectLink(site, value), participantId: who.id, unverified: true, completed: value.completed, contributions: value.contributions.length };
  }
  if (action === 'cast') {
    const turn = runLocalCastTurn(value, { intention: options.intention ?? 'wander', approach: options.approach ?? 'cautious' });
    return { link: projectLink(site, turn.project), completed: turn.project.completed, events: turn.events.map(e => e.summary ?? e.type ?? '').filter(Boolean), stopReason: turn.stopReason };
  }
  fail('Unknown group action');
}

export async function run(argv, { root = ROOT, log = console.log } = {}) {
  const { positional: [command, sub, target], options } = parseArgs(argv);
  const site = () => siteFor(options, root);
  const out = value => log(typeof value === 'string' ? value : JSON.stringify(value, null, 2));
  if (!command || command === 'help') return log(HELP);
  if (command === 'mood') return out(mood(sub, { root }));
  if (command === 'experiment' && sub === 'play') return out(experimentPlay(options, site()));
  if (command === 'experiment' && sub === 'remix') return out(experimentRemix(target, options, site()));
  if (command === 'group') return out(groupCommand(sub, target, options, site()));
  if (command === 'gift' && sub === 'from-group') {
    const gift = createGroupGift(project(target));
    const hasOut = Object.hasOwn(options, 'out'), hasOutDir = Object.hasOwn(options, 'out-dir');
    if (hasOut && hasOutDir) fail('Choose either --out-dir <directory> or --out <gift-id>.json, not both.');
    for (const key of ['out', 'out-dir']) {
      if (Object.hasOwn(options, key) && (typeof options[key] !== 'string' || !options[key].trim())) fail(`--${key} needs a ${key === 'out' ? 'file path' : 'directory'}.`);
    }
    const filename = `${gift.id}.json`;
    if (hasOut && path.basename(options.out) !== filename) fail(`Gift filename must be ${filename}. Use --out-dir <directory> to choose a folder, or --out <directory>/${filename}. The gift ID must stay unchanged for provenance.`);
    const file = hasOut ? options.out : hasOutDir ? path.join(options['out-dir'], filename) : filename;
    if (hasOutDir) mkdirSync(options['out-dir'], { recursive: true });
    writeFileSync(file, formatGift(gift));
    return out({ file, id: gift.id, title: gift.title });
  }
  fail(`Unknown command. Run "node tools/dot.mjs help".`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run(process.argv.slice(2)).catch(error => { process.stderr.write(`dot: ${error.message}\n`); process.exitCode = 1; });
}
