# One local cast turn

The group flower page offers an optional way to choose the direction while its fictional characters choose their own legal parts. Select a wandering flower or a playful performance, then a cautious or experimental approach for that turn. Click **Try a shared creation** to get an immediate result.

The cautious approach refines a familiar shape and rhythm, and favors familiar complementary collaborators. The experimental approach gives newer pairings a turn, tries unfamiliar combinations and prefers counterstep once the engine has actually unlocked it. Both approaches change real contributions; they are not alternative narration for the same artifact. The approach applies to this local turn, not a stored personality or authenticated agent identity.

## Boundaries

- A cast turn is a deterministic local game policy. It makes no network requests, contacts nobody, and runs only when the button is pressed
- It acts only for participants marked as fictional game characters. Local participants and unverified guest claims remain manual
- It can add at most three consequential contributions to a chapter, counting its existing manual and received contributions. Manual play can continue beyond that limit, or the user can choose a linked chapter
- Each character acts at most once per turn. Every action is role-legal, materially changes the recipe, and passes through the existing engine. The policy rechecks the current artifact after every change
- Missing parts and new contributors take priority over remembered familiarity. A small role-cover check reserves flexible guests when another part needs them, so partner ranking cannot discard an available complete three-character ensemble
- There are no background turns, absence penalties or timed progression. Sound and motion retain the existing controls

## Results and progress

`runLocalCastTurn` returns the actual immutable project, performed events, local history, relationship changes and a suggested next chapter. Summaries describe accepted contributions. A repeated experience type adds no extra relationship credit. Opening or decoding a completed share imports no credit; it does not carry an engine receipt.

Two different locally completed experience types with a partner unlock counterstep through the existing engine. A future experimental cast turn can then choose it. Choosing or suggesting a chapter never completes it automatically.

The result is kept in the same bounded local notebook, with the original copy preserved. Direction and approach are policy inputs outside the recipe payload. The existing v1 and v2 save/share schemas, legacy base metadata and imported provenance remain unchanged.

## Choosing collaborators from shared experience

Use **Add a workshop character** to open the existing participant form for another fictional character. Giving two fictional characters the same part lets the cast choose a collaborator, while the default three-character roster remains unchanged.

Choices consult only the validated local notebook as it stood before the turn: this project lineage, participants still present, and the pair’s distinct completed experience types. Cautious prefers more shared types; experimental prefers fewer. A stable ID breaks otherwise equal ties, independent of roster display order. If nobody has contributed yet, the first choice can consider a prospective complementary partner; the journal labels that prospect honestly. Once someone has contributed, later choices can refer to that actual contributor.

Every accepted event explains its choice and exposes the actual contribution record ID and before/after snapshot IDs. Its remembered types exactly match the pre-turn notebook. These are narrow shared-experience records, not detailed remembered conversations or recipe histories. Imported recipe data, unrelated lineages, absent partners and legacy history cannot supply this evidence. Ranking or considering a partner never awards credit; only the unchanged completion engine can do that.

## Verification

`npm test`, `npm run validate:gifts` and `npm run build` cover the engine and build. The browser suite includes opt-in behavior, contrasting approaches, three-event stop, guest/source preservation, real history unlocks, mobile and reduced-motion controls, and denied storage. Live production checks repeat the three-chapter flow against the published commit.
