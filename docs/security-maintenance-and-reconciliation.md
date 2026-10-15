# Security Maintenance and Execution Reconciliation

## Administrator edits

The security-library table includes an **Edit** action. Administrators can correct the ticker, exchange, names, style, reference information, and verified trading-lot size. A reason is required. Saving rechecks real price availability and available listing-venue evidence; unavailable prices and a contradictory venue are rejected. Unknown venue evidence is disclosed for administrator verification, not represented as a verified match.

Edits are organization-scoped. Editing a shared seed entry creates an organization override rather than changing other teams' catalogues. Stale edits and duplicate target identities are rejected. Audit events retain the actor, reason, and before/after values. Historical approved portfolio snapshots and previously imported fill batches are not rewritten.

For a verified venue correction with the **same ticker and same market**, the application records an explicit identity correction. Future reconciliation can match an old approved venue typo to the corrected security without editing that approved plan. This is not a blanket equivalence between NASDAQ and NYSE. Ticker changes and cross-market changes do not create automatic identity mappings. Correction cycles and duplicate approved orders after correction are blocked.

For the reported entries, official issuer pages identify [COST as NASDAQ](https://investor.costco.com/stock-info/) and [CRCL as NYSE](https://investor.circle.com/stock-info/default.aspx). An administrator must apply these edits to the deployed database; the release does not silently alter customer records. After saving, generate a fresh fill preview and import again where necessary. Existing batches retain their original reconciliation evidence. Approved batches cannot simply be deleted to erase history.

## Percentage-based differences

The existing default tolerance is **2% of each planned order**, not a fixed USD 10,000 threshold. Each batch retains its selected tolerance. Both preview and saved results now show the percentage difference, allowed amount, and explanation.

For a planned USD 225,000 and actual USD 199,100:

- Difference: USD -25,900.
- Difference percentage: approximately -11.51%.
- At 2%, the allowed difference is USD 4,500, so this remains an exception.

Price and planned value must already use the same base currency. This feature does not perform FX conversion. Quantity means shares, not trading lots.

## Trading lots and human review

[JPX describes the 100-share unit for domestic stocks](https://www.jpx.co.jp/english/equities/trading/domestic/03.html). Migration 0026 initializes a 100-share lot only for the identified 6861/TSE/JP common-stock entry, not every Tokyo-listed instrument. Administrators can maintain other explicitly verified lot sizes.

When an underfilled buy equals the whole-lot quantity obtained by rounding the target down at the submitted fill price, reconciliation displays a **possible lot-rounding explanation**. This is an estimate, not proof of the execution reason: the actual fill quantity, price, currency, and execution circumstances still need review. Overspends and quantities that do not match that calculation do not receive this hint. No lot hint automatically passes an order or relaxes the tolerance.

A different execution-team user must review the import. Approving a batch with exceptions requires a written explanation of at least five characters. The reviewer, decision, time, explanation, and line-level reconciliation evidence are stored. Approval of the review does not relabel an exception as a matched trade or amend the approved plan.

## Deployment and verification boundary

Migration 0026 is additive; no database reset or extra hosting service is required. Existing records are retained. The normal private-repository Render migration/start sequence applies the schema update.

Verification passed 130 automated tests (90 API/database, 19 web, 21 domain), workspace type checks, and production builds. Integration tests apply all 26 migrations and cover permissions, organization isolation, shared overrides, live-check rejection with mocked provider responses, stale edits, venue correction, unchanged approved snapshots, persisted fill diagnostics, and two-person review with a required explanation. Local mocked desktop/mobile browser checks exercise COST/CRCL editing, 6861 explanations, review submission, and existing import/revision flows. A compiled-optimizer 256 MB heap smoke test also passed as a regression check.

These local tests do not certify production deployment, live brokerage data, currency correctness, or financial-model acceptance. No production database was reset during verification.
