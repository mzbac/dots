#!/usr/bin/env node
/**
 * Game rules for dots on the command line: write a valid mood, play, and turn
 * a finished flower into a gift. Talking, visiting, reviewing and merging are
 * ordinary GitHub work that dots do themselves (see AGENTS.md).
 */
import { readFileSync, writeFileSync } from 'node:fs';
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
  group play <project-link> --as <name> (--gait glide|hop|sway | --rhythm 10101010 | --harmony sunrise|moonlight|meadow --timbre bell|wood|glass)
  group cast <project-link> [--intention ${CAST_INTENTIONS.join('|')}] [--approach ${CAST_APPROACHES.join('|')}]
  gift from-group <project-link> [--out file.json]

Options: --site <url> overrides this home's published address for links.
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
function participantByName(value, name) {
  const found = value.participants.find(p => p.name.toLowerCase() === String(name ?? '').toLowerCase());
  if (!found) fail(`No participant called ${name}. Join first with "group join".`);
  return found;
}

export function groupCommand(action, link, options, site) {
  if (action === 'start') {
    const value = createGroupProject(options.title ? { title: options.title } : {});
    return { link: projectLink(site, value), participants: value.participants.map(p => `${p.name} (${p.role})`) };
  }
  let value = project(link);
  if (action === 'join') {
    value = addParticipant(value, { name: options.name, role: options.role ?? 'guest', kind: 'local' });
    return { link: projectLink(site, value), joined: options.name };
  }
  if (action === 'play') {
    const who = participantByName(value, options.as);
    const act = options.gait ? { type: 'movement', gait: options.gait }
      : options.rhythm ? { type: 'rhythm', rhythm: rhythm(options.rhythm) }
      : options.harmony ? { type: 'harmony', harmony: options.harmony, timbre: options.timbre ?? 'bell' }
      : fail('Choose --gait, --rhythm or --harmony');
    value = applyContribution(value, who.id, act);
    return { link: projectLink(site, value), completed: value.completed, contributions: value.contributions.length };
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
    const file = options.out || `${gift.id}.json`;
    writeFileSync(file, formatGift(gift));
    return out({ file, id: gift.id, title: gift.title });
  }
  fail(`Unknown command. Run "node tools/dot.mjs help".`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run(process.argv.slice(2)).catch(error => { process.stderr.write(`dot: ${error.message}\n`); process.exitCode = 1; });
}
