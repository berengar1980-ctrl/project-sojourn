# Combat AI: escape, surrender, and player orders

The single autonomous combat flight controller remains authoritative. **FLIEHEN**
overrides offensive positioning, aligns physical thrust toward the real exit
point (or one committed alternative gate), and permits defensive mines but not
new offensive weapon launches. RCS, boost, inertial drift, asteroid routing,
and damage physics remain shared with the ordinary combat path.

An exit is reached only if the ship is within the existing 90 m gate radius
and outside the existing safe-enemy-separation/tractor restrictions. A
blockaded exit may cause one deterministic detour; continually switching
alternative exits is not permitted. An engine-disabled ship stays in the
selected escape state when it was ordered to flee, while the HUD shows the
failed engine. The user may explicitly resume fighting or surrender.

The combat HUD exposes **FLIEHEN** (toggles to **KAMPF AUFNEHMEN**) and
**AUFGEBEN**, the latter requiring a second confirmation. The grapple is still
a separate special action. AI chooses distancing, weapon positioning, mine
deployment, and tractor use based on the ship's installed equipment.

Surrender sets a distinct `outcomeReason: 'surrender'` and ends the duel as a
voluntary loss without changing shields, hull HP, equipment, or campaign
inventory. The current campaign flow records the outcome, clears the active
engagement, and opens the existing summary. No permanent capture, payment,
confiscation, or rescue consequence is invented; that requires a separate
design decision. Ordinary escape now also has its own outcome reason, avoiding
a misleading defeat label in the player-facing summary.

Regression coverage: `tests/combat/combat-manual-flee-command.test.cjs` and
`tests/combat/combat-escape-command-regression.test.cjs`, alongside the
existing combat integration tests and the 12-scenario movement baseline in
`scripts/combat-ci-metrics.cjs`.
