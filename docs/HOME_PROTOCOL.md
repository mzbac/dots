# Static-gift home protocol v1

This is an **offline, owner-reviewed data protocol**, not an agent messenger.
It can describe an invitation, a declared intent, a bounded static gift, an inert
local review, an explicit local decision, and an unsent acknowledgement record.
There is no network request, arbitrary URL fetch, contributor code execution,
GitHub comment, send, merge, installation, or publication in the parser/reviewer.

## What a public home descriptor means

`createHomeDescriptor(homeConfig, { repository, revision })` in
`src/home-protocol.js` returns a deeply frozen descriptor only when the trusted
build repository matches `home.json`'s owner. `repository` must be the actual
build's `GITHUB_REPOSITORY`, and `revision` the full 40-character build commit.
Missing build identity or copied upstream configuration in a fork returns null;
a mismatched fork must omit the asset, never inherit the upstream descriptor.
The build can publish a matching result as `home-descriptor.json`.

The descriptor names schema version 1, gift schema version 1, the build commit,
and exact capabilities `gift-v1-static` and `local-review-v1`. All addresses are
recomputed from the repository: GitHub repository, invitation and hello issue
forms, pull-request list, GitHub Pages home, and descriptor. A root
`owner/owner.github.io` repository gets the Pages root. Custom domains,
redirects, callback URLs, downloaded code, and arbitrary links are unsupported.

A descriptor is a public repository claim. Its fingerprint is **not** a
signature, proof of identity, permission, or proof that the repository exists.
An owner supplies a trusted known counterpart descriptor and recipient context;
imported claims cannot choose the owner's repository or authorization.

## Narrow message contract

All envelopes contain exactly:

- `schemaVersion: 1`, one supported `kind`, and a lowercase `exchangeId`
- Consecutive `revision` and exact `parentFingerprint` (null only for the root)
- `from` and `to`: exact repository plus the pinned descriptor fingerprint
- Whole-second UTC `createdAt` and `expiresAt`, at most seven days apart
- Exact kind-specific `payload`, its `payloadFingerprint`, and envelope `fingerprint`

SHA-256 fingerprints use canonical JSON with recursively sorted object keys,
JSON primitive encoding, and ordered arrays. Payload fingerprints cover the
payload. Envelope fingerprints cover all envelope fields except `fingerprint`.
They bind immutable revisions and detect changed data, not authenticated
identity. Anyone can recompute them. Public descriptions and creator labels
remain unverified content, never executable instructions or permission grants.

The ordered exchange is:

1. `invitation`, revision 0, owner → peer: `title`, `request`, trusted `slot`,
   descriptive complementary `role`, and `giftSchemaVersion: 1`
2. `intent`, revision 1, peer → owner: `invitationFingerprint`, `summary`, same
   `slot`, same `role`
3. `contribution`, revision 2, peer → owner: `invitationFingerprint`,
   `intentFingerprint`, `supersedes: null`, same `slot`/`role`, and `gift`
4. Optional contribution revisions 3–8: each must bind its exact previous
   envelope and superseded contribution; the gift ID, source intent, slot,
   role, homes, and exchange ID cannot change
5. `acknowledgement`, owner → peer: `contributionFingerprint`,
   `decisionFingerprint`, and `outcome` of `accepted-locally` or
   `declined-locally`. The last possible revision, 9, is reserved for this record

An acknowledgement is data to inspect or separately share. It does **not** mean
sent, received, merged, installed, or deployed. Validation will not treat an
imported acknowledgement or serialized decision as local authority. A local
acknowledgement is minted only from a fresh in-memory review, an explicit local
choice, and the exact preview fingerprint. That review receipt can be used once.

The role is a descriptive request for human review, not engine-verified proof of
what a contributor did. **Editable group-project roundtrips are unsupported.**
The envelope protocol does not import a group project, award contributor credit,
or transfer movement/music. A group gift can be proposed as an unchanged static
gift-v1 payload. The optional packet layer below can also consistency-check its
source recipe and declared attribution as inert metadata; it never authenticates
people or establishes that the claimed collaboration actually happened.

## Local trust boundary and resources

Use the script from a trusted owner checkout. Never run it, install dependencies,
or import modules from a contributor branch. Copy only the specifically selected
JSON data into an isolated local directory containing `peer.json` and
`exchange.json`, or select one strict `--packet` file and optional separate
`--source-evidence` receipt as described below. Extra files are not read. The exchange cannot select local file
paths, output files, code, ledger history, repository settings, or URLs.

The owner's `home.json`, `community/world.json`, accepted gift registry, and
optional local ledger are separate trusted inputs. The CLI reads only accepted
paths named by the trusted world and validates them again. It rejects symlink
components, traversal/URL paths, nonregular files, invalid UTF-8, changing files,
and oversized files, using the existing bounded local JSON reader. As with that
reader, use stable directories owned by the operator; it is not a sandbox for a
hostile process concurrently replacing parent directories.

Limits are 64 KiB for the entire imported exchange JSON, 8 KiB per descriptor,
16 JSON nesting levels, 12,000 JSON values, 10 envelopes including acknowledgement,
and 32 local ledger records. Packet-mode input is capped at 48 KiB and its optional
source receipt at 8 KiB. Duplicate object keys, prototype keys, getters,
unsupported versions, unexpected fields, nonfinite values, script/URL fields,
and unsupported message kinds fail closed. Gift-v1's existing 512-box,
32-unit-dimension and palette limits remain authoritative. Placement is rebuilt
through the unchanged world validator, including slot occupancy, extents,
protected areas, accepted IDs and total block limits.

The inert review includes a script-free SVG, validated placement, the before/after
accepted registry, immutable contribution and gift fingerprints, pinned home
descriptor fingerprints, the original ledger fingerprint, and a base-world
fingerprint that also binds accepted gift geometry. Packet mode additionally
binds all validated packet/provenance, attribution and optional source receipt
through `reviewContextFingerprint`. `installed`,
`identityAuthenticated`, and `publicationAuthorized` are always false.

The local ledger preserves append-only reviewed/decided records. Exact and
canonical gift-payload repeats are rejected even under a new exchange ID. A
newer contribution must descend from the owner's latest reviewed revision;
competing siblings fail as conflicts instead of replacing it. The owner must
review competing proposals separately; no branch is automatically chosen.
Decided exchanges cannot be reopened. Full ledgers fail closed without evicting
history; review an archival/rollover plan separately. Do not clear the ledger to
bypass replay checks. Fingerprints include gift metadata, so this is exact
canonical-payload deduplication, not visual similarity detection.

## Inspect, then make a local decision

The CLI writes **only JSON to stdout**. The operator controls saving the report,
extracting its `previewSvg`, and retaining ledger snapshots. It never writes a
gift into the repository. For real data, pin `--revision` to the revision in the
owner's deployed `home-descriptor.json`, not blindly to the latest main HEAD:
status-only commits may not rebuild the public home. The descriptors embedded
in the exchange must exactly match the pinned source and recipient revisions.

Example from a trusted checkout, after independently obtaining the intended
public descriptors and exchange JSON:

```sh
node tools/review-home-envelope.mjs \
  --input /absolute/isolated-exchange \
  --repository OWNER/REPOSITORY \
  --revision DEPLOYED_DESCRIPTOR_FULL_COMMIT \
  --ledger /absolute/owner-state/ledger.json
```

Omit `--ledger` only for a genuinely new local ledger. Default time is the actual
current clock. Inspect the preview, exact destination, gift, source claims,
registry diff and `review.reviewFingerprint` before choosing. With the **same
original ledger snapshot and input files**, rerun with:

```sh
node tools/review-home-envelope.mjs \
  --input /absolute/isolated-exchange \
  --repository OWNER/REPOSITORY \
  --revision DEPLOYED_DESCRIPTOR_FULL_COMMIT \
  --ledger /absolute/owner-state/ledger.json \
  --decision accept \
  --expect sha256:EXACT_REVIEW_FINGERPRINT
```

Use `--decision decline` to record a local rejection. The second run rereads and
revalidates current trusted world/gifts, input lineage, clock and original ledger.
Changed reviewed data yields a different fingerprint and requires inspection
again. The output contains `decision`, unsent `acknowledgement`, and `nextLedger`.
Retain the original report and persist the **final** `nextLedger` separately as
owner state, outside imported data. Acceptance does not authorize any publication.

Do **not** persist the preview-only `nextLedger` between inspect and decide: that
records the contribution as already reviewed, so replay validation correctly
rejects another review of it. Preview-only history is useful if you decide to
wait for a revised contribution instead of making a final decision. Keep that
record, then import the full descendant chain and inspect its new review.

Installation, committing, sending the acknowledgement, opening/commenting on a
GitHub issue/PR, and deployment are separate owner-authorized actions. Do not
infer permission from the public descriptor, incoming invitation, preview,
acceptance JSON, or issue text.

## Optional packet and source-receipt review

The separate trusted [packet adapter](HOME_PACKETS.md) accepts exact data of this form:
`{schemaVersion: 1, peer: descriptor, envelopes: [...], provenance?: [...]}`.
The optional provenance array binds each entry to a contribution fingerprint.
It regenerates the static gift and full declared provenance from the canonical
completed group recipe and requires exact equality. This is a consistency check,
not authorship verification, live project import, or relationship credit.

Select the saved packet instead of `--input`:

```sh
node tools/review-home-envelope.mjs \
  --packet /absolute/isolated-exchange/home-packet.json \
  --source-evidence /absolute/isolated-exchange/source-evidence.json \
  --repository OWNER/REPOSITORY \
  --revision DEPLOYED_DESCRIPTOR_FULL_COMMIT \
  --ledger /absolute/owner-state/ledger.json
```

`--packet` and `--input` are mutually exclusive. The optional receipt must be in
the packet's isolated directory, is unsupported with `--input`, and is never
fetched or followed. It must match the canonical packet fingerprint and exact
owner repository. A saved receipt can be fabricated; it supplies unverified
source claims, not authenticated transport, identity, or permission. Omitting
it is explicitly represented as no receipt in the review context.

Inspect `packetReview.provenance` (including contributor labels and source
recipe), `packetReview.attribution`, and `packetReview.sourceEvidence` along with
the gift preview. `exact-group-reproduction` means only that the supplied recipe
reproduces the supplied static gift and declared provenance. The result always
requires attribution review and retains `identityAuthenticated: false`.

The reviewer itself hashes the entire validated packet (including exact source
recipe/provenance), derived attribution report, and the exact validated receipt.
It never accepts an incoming context digest as authority. Those fingerprints
are incorporated into `review.reviewFingerprint`; changing or removing a receipt
or provenance invalidates the prior inspection even when gift geometry and the
contribution envelope are unchanged. Decide with the same packet, receipt,
trusted world and original ledger, adding `--decision accept|decline` and
`--expect` exactly as above. The acknowledgement remains unsent local data.

## Executable fictional offline example

These two homes are **explicitly fictional**. The commands do not contact their
derived GitHub addresses and do not establish real external participation.
Run from the repository root. The two fixture directories are separate owner
and inbound-data roots; `--home-root` selects the fictional owner only.

```sh
node tools/review-home-envelope.mjs \
  --home-root tests/fixtures/home-protocol/owner \
  --input tests/fixtures/home-protocol/inbound \
  --repository fictional-amber-home/workshop \
  --revision aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
  --now 2026-09-30T12:00:00Z
```

Copy `review.reviewFingerprint` from that output into the following command, or
compare it against `tests/fixtures/home-protocol/expected-review.json`:

```sh
node tools/review-home-envelope.mjs \
  --home-root tests/fixtures/home-protocol/owner \
  --input tests/fixtures/home-protocol/inbound \
  --repository fictional-amber-home/workshop \
  --revision aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
  --now 2026-09-30T12:00:00Z \
  --decision accept \
  --expect sha256:EXACT_REVIEW_FINGERPRINT_FROM_PREVIOUS_OUTPUT
```

Both commands use the same empty baseline. The fixed historical test clock is
only for this fixture; do not override the clock to accept expired real input.
The full deterministic integration test checks invitation → intent →
complementary gift → local preview/diff → explicit local acceptance → unsent
acknowledgement, plus expiry, recipient mismatch, tampering, exact/semantic
replay, conflicting updates, local-decision spoofing and resource limits:

```sh
node --test tests/home-protocol.test.mjs
```

No fixture gift or event enters the actual public world/history. Real external
proof still requires a named second authorized home/operator, permission for
the specific communication destination and an actual external response.
