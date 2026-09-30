# Read-only home packets

This is a narrow, **owner-selected read-only importer**, not discovery or an
agent messenger. Run the trusted importer from the owner's existing trusted
checkout. Do not check out or execute a contributor's branch, install its
packages, or run its workflows. Importing never comments, acknowledges a sender,
changes a ledger, accepts a gift, installs code, merges, or publishes anything.

Only the explicitly selected packet is inspected. **All other PR files, code,
workflows and changes remain unreviewed.** The strict receipt always includes
`reviewScope: "selected-packet-only"`; never infer whole-PR safety or merge approval
from a successful packet import or local gift decision.

## Packet schema

One packet has exactly these fields:

```json
{
  "schemaVersion": 1,
  "peer": "the complete strict home descriptor object",
  "envelopes": ["the unchanged ordered home-protocol envelope objects"],
  "provenance": [
    {
      "contributionFingerprint": "sha256:the exact contribution revision",
      "group": "the complete createGroupGiftProvenance output object"
    }
  ]
}
```

The strings above explain the nested objects; they are not literal valid packet
values. `provenance` is optional. It contains at most eight entries, each bound to
one unique, present contribution fingerprint. All other keys are rejected.
Descriptors and exchanges retain the rules in [HOME_PROTOCOL.md](HOME_PROTOCOL.md).
The packet cannot choose the owner's identity, ledger, local paths, network
endpoints, commands, authorization, or decisions.

`parseHomePacketJson` rejects duplicate/prototype keys, non-JSON input, unsupported
shape, nesting beyond 16 levels, and resource overruns. `validateHomePacket` then
validates the whole exchange against the explicitly supplied trusted owner
context, validates fingerprints and lineage, and rechecks any group provenance.
Public home and creator declarations are not proof of identity or permission.

### Exact group provenance

The imported `group.sourceRecipe` must decode as a canonical completed group
recipe. The validator regenerates both `createGroupGift` and
`createGroupGiftProvenance` and compares their entire canonical JSON fingerprints
with the submitted gift and provenance. Gift ID, title, description, geometry,
contributor labels and contribution IDs, project/root/parent IDs, and generation
must all match. Incomplete recipes, missing or forged contributor credits,
unrelated provenance, extra keys, and altered geometry are rejected.

This is deterministic **data consistency**, not authenticated authorship,
participation, rights, or consent. Attribution still requires owner review.
A gift without provenance is explicitly marked `no-group-provenance` and receives
ordinary attribution review. No editable project is installed or resumed; no
relationship history, achievement, or unlock is granted.

## Explicit sources

The caller chooses one repository, item type, item number, and source. The
repository must exactly match the trusted home descriptor, which the CLI builds
from `home.json` and explicit `--repository` / full `--revision` arguments.
No repository/item is inferred from imported prose or discovered automatically.

Supported sources:

- `issue` or `pull-request`, `body`: exactly one top-level typed JSON fence
- `issue` or `pull-request`, `comment`: one explicitly selected numeric comment ID
- `pull-request`, `file`: exactly `community/proposals/home-packet.json`

For a body or comment, use a fence with the exact language name:

````text
```dot-home-packet
{ the strict packet JSON }
```
````

The typed fence must begin and end on their own unindented lines with exactly
three backticks. Multiple declarations, malformed declarations, and declarations
inside other Markdown fences are rejected. Other prose, URLs, attachments,
commands, and code fences stay inert. They are never followed or executed.

The importer validates the exact GitHub item number, ID, node ID, canonical
item/permalink association, and issue/comment association. It reads item metadata
again after extraction/validation; comments are also read twice. An ID, body
fingerprint, update timestamp, or PR-head change causes rejection, even when the
body changed without a new timestamp. This establishes a consistent bounded read;
it does not prevent edits after the final read, recover prior issue edits, or
make mutable issue/comment content permanently retrievable.

For PRs, the **base repository** must be the owner repository. A fork head is
allowed as an untrusted claim; its repository/URLs are never followed. The
importer pins the full head SHA. For file input, it checks a complete bounded
changed-file listing, then reads the pinned commit and three nonrecursive Git
trees, followed by the exact `100644` JSON blob. Renames, symlinks, executable
modes, duplicate entries, missing paths, truncated trees, and SHA mismatches are
rejected. Raw blob bytes must reproduce the declared Git blob SHA. Every request
uses the owner's `api.github.com/repos/OWNER/REPO/` prefix. If a fork's pinned
objects are unavailable through that endpoint, import fails without trying a
foreign-repository fallback. A packet in the PR body or an explicitly selected
comment remains a supported alternative.

### Resource limits

- Whole packet: 48 KiB; source receipt: 8 KiB; complete import report: 64 KiB
- Each GitHub response: 64 KiB, capped while streaming before strict JSON parsing
- At most 10 GET requests, 15 seconds per request; no pagination or recursive crawl
- Fewer than 100 changed files and at most 256 entries per selected Git tree
- Existing protocol depth, node, envelope, descriptor and gift budgets still apply

**Transport overhead counts.** The 48 KiB packet parser maximum does not guarantee
that every packet of that size fits a GitHub response. JSON string escaping and
base64 blob encoding count against the separate 64 KiB response budget; a valid
large packet may therefore fail import and must be made smaller. The importer
never relaxes a cap, follows a redirect, or downloads a larger alternate URL.
It sends no credentials, creates no grants, and uses no credential environment
variables. Public read failures remain explicit failures.

## CLI and inert receipt

Example syntax for an **already known, explicitly selected** issue:

```sh
node tools/import-home-packet.mjs \
  --home-root /trusted/owner-home \
  --repository OWNER/REPO --revision FULL_40_CHARACTER_OWNER_COMMIT \
  --type issue --number KNOWN_ISSUE_NUMBER \
  > /isolated/inbound/home-packet.json \
  2> /isolated/inbound/source-evidence.json
```

The shell redirections are owner-chosen; the importer itself writes no files.
On success, stdout contains the packet and stderr contains the separate strict
source receipt. On failure, stdout is empty and stderr is an error, not a valid
receipt. Always check the process exit status. For a comment, add
`--source comment --comment KNOWN_COMMENT_ID`; for a PR file use
`--type pull-request --source file`. There is no arbitrary URL or path option.

The receipt records the selected repository/item/source, item and optional comment
IDs/node IDs/update timestamps/raw-body SHA-256 fingerprints, observed time,
canonical packet fingerprint, and exact PR head. File receipts additionally bind
the fixed path, commit, root tree, blob SHA, byte length, raw-byte SHA-256, and
`100644` mode. It contains no arbitrary URLs and always says
`identityAuthenticated: false`. Body fingerprints hash raw UTF-8 bytes; packet
fingerprints use the protocol's sorted-key canonical JSON algorithm.

A saved receipt is still **unverified imported evidence**. Anyone can fabricate
one and recompute its fingerprints. Its schema/packet-binding checks do not prove
that a network read happened or authenticate a GitHub account/home/operator.

Review the same packet using the trusted offline CLI:

```sh
node tools/review-home-envelope.mjs \
  --packet /isolated/inbound/home-packet.json \
  --source-evidence /isolated/inbound/source-evidence.json \
  --home-root /trusted/owner-home \
  --repository OWNER/REPO --revision FULL_40_CHARACTER_OWNER_COMMIT
```

`--source-evidence` is optional, but retaining it preserves the pinned read context.
The packet/provenance/receipt are included in the local review-context fingerprint;
changing or dropping them makes an earlier `--expect` stale. Even an explicit
local decision only emits inert JSON and an unsent acknowledgement. Normal owner
review, target-specific permission and publication gates remain separate.

The importer tests use injected responses only. They cover fork heads, exact
source bindings, same-timestamp revision races, changed PR heads, executable and
symlink blobs, path substitution, redirects, malformed UTF-8, stream caps,
ambiguous/nested fences, duplicate JSON keys, provenance tampering, and filesystem
read protections. They do not manufacture an incoming GitHub item or contact any
outside home.
