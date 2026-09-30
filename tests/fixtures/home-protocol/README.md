# Two explicitly fictional homes: offline integration fixture

**Fictional Amber** (`fictional-amber-home/workshop`) and **Fictional Moss**
(`fictional-moss-home/garden`) are invented fixture labels. Their derived URLs
are syntax examples only. Nothing in this directory records an actual person,
account, invitation, response, message, review, acceptance, or deployment.
The test does not fetch those URLs or check whether those account names exist.

The owner fixture requests a static bloom for `bloom-plot`, beside its static
stem. The peer fixture declares the descriptive `petal-maker` role and proposes
five gift-v1 boxes. This demonstrates a complementary static gift, not a shared
editable group project, authenticated identity, autonomous cooperation, or
preserved animation/music.

- `owner/` contains the separate trusted fictional home, world and accepted stem
- `peer-home.json` is the second fictional home's public configuration
- `inbound/peer.json` is that fixture home's derived descriptor
- `inbound/exchange.json` is invitation → intent → contribution, in order
- `empty-ledger.json` is the original local review baseline
- `expected-review.json` is the inert local preview and candidate registry diff
- `expected-local-decision.json` is a fixture local owner's explicit acceptance decision
- `expected-acknowledgement.json` is its unsent acknowledgement data
- `expected-final-ledger.json` preserves the local decision for replay rejection

The test clock is `2026-09-30T12:00:00Z`. The exchange expires on
`2026-10-07T11:00:00Z`; tests supply the fixed clock explicitly. Do not substitute
fixture clocks to make expired real exchanges pass.

Run `node --test tests/home-protocol.test.mjs` from the repository root. See
`docs/HOME_PROTOCOL.md` for an executable offline CLI workflow and the limits of
local review. No fixture is added to the actual garden or public activity feed.
