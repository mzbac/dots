# Stable contract fixtures

`reference-home.json` and `reference-world.json` describe the original test
configuration. Pure contract, replay, placement and preview tests use these
fixtures so legitimate owner changes to a published home do not rewrite their
meaning. The reference world has one accepted welcome planter and three empty
slots, including the reserved local-preview slot.

`configured-community.test.mjs` and the gift-validator CLI test separately read
and validate the actual configured world, every accepted gift, and neighbours.
Do not replace these real-configuration checks with fixture-only validation.
