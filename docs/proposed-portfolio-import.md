# Proposed Portfolio Import and Draft Editing

## Saved data, preview, and draft

The proposed-portfolio page opens with the latest version saved for the current annual workflow. An empty workflow shows no holdings. System recommendations are loaded only through **Load recommendations** and remain an unsaved draft.

Choosing a CSV opens an explicit preview; it does not change the saved portfolio or the current draft. **Apply to draft** changes only browser memory. **Submit draft for backtest** saves a new version and advances the workflow. Leaving or refreshing with unsaved changes prompts for confirmation; browser drafts are not durable storage.

## Import choices

- **Replace all:** the new list replaces the current draft or saved list. Existing names omitted from the file are marked for removal.
- **Merge:** imported names update matching names, new names are added, and other existing names are kept.
- Each preview row can use imported values, keep existing values where available, or be removed/skipped.
- **Cancel entire import** closes the preview without changing the current draft or database.

CSV columns: `Ticker,WeightPercent`; optional `Exchange` identifies the listing. `WeightPercent=1` means 1%, not 100%. Weights are within each market sleeve, not percentages of the entire portfolio. Each of the U.S., Japan, and emerging-market sleeves must independently total 100%.

Every non-empty CSV row remains visible, including unknown or ambiguous securities. Leading zeroes and supported regional exchange aliases are normalized. Unknown names are never silently omitted. Invalid selected rows and duplicate identities block applying the preview; policy violations block submission.

## Editing and policy controls

The Execution Team can add, replace, remove, and change weights in an unsaved draft only at the proposed-portfolio workflow step. Saved historical versions are read-only and are not deleted by replacing a draft. Discarding the draft restores saved holdings. Counts are displayed for the whole list and separately for each market tab.

Submission validates positive weights, unique securities, allowed markets, the effective single-name limit, style-count limits, and 100% sleeve totals. The old fixed 30-name request limit is replaced by a 600-row safety bound; effective style-count policy still determines the permitted business size. Database rounding preserves each sleeve's 100% total at eight-decimal precision.

## Unknown securities

An administrator can use **Securities** to register a verified ticker, exchange, Chinese/English name, growth/value style, and reference source. Additions are audited and scoped to the administrator's organization. Shared seed securities remain available. Registration does not add the stock to a portfolio, approve it for investment, or guarantee that the data provider covers its price history.

After registration, the Execution Team selects **Refresh universe**, chooses the security in the preview, and reviews its weight. Business personnel must confirm classifications and any policy changes; backtesting still checks real price coverage.

## Upgrade and test checklist

Migration `0020_organization_securities.sql` preserves existing shared securities and portfolio history; it adds organization-scoped registration. Use the normal migration command during deployment. No database reset is required. Follow the existing production backup procedure before schema updates.

Manual acceptance:

1. Open the proposed step and confirm the saved version, total count, and three market counts.
2. Choose a CSV; confirm every row appears and the saved list remains unchanged.
3. Try replace, merge, keep, and skip; cancel and verify nothing was saved.
4. Apply a list to the draft; remove/add a stock and correct its weight. Check validation messages.
5. Try an unknown stock, a duplicate, a wrong exchange, and invalid weights; confirm no partial save occurs.
6. Have an administrator register a missing stock, refresh the universe, and map it in the preview.
7. Submit a valid draft; refresh and confirm the new saved version. Revisit it from the backtest step and confirm historical editing is disabled.
8. Repeat on a mobile browser and check the horizontally scrollable preview table.

Automated coverage includes CSV parsing, full-list import, replace/merge/keep/skip behavior, unknown and ambiguous stocks, policy validation, populated-database migration, registration authorization/audit/organization isolation, and 36-name persistence with an increased effective style limit. Browser acceptance uses local mocked API responses; it is not a live brokerage or production-data test.
