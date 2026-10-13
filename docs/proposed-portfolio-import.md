# Proposed Portfolio Import and Draft Editing

## Saved data, preview, and draft

The proposed-portfolio page opens with the latest version saved for the current annual workflow. An empty workflow shows no holdings. System recommendations are loaded only through **Load recommendations** and remain an unsaved draft.

Choosing a CSV opens an explicit preview; it does not change the saved portfolio or the current draft. **Apply to draft** changes only browser memory. **Submit draft for backtest** saves a new version and advances the workflow. Leaving or refreshing with unsaved changes prompts for confirmation; browser drafts are not durable storage.

## Import choices

- **Replace all:** the new list replaces the current draft or saved list. Existing names omitted from the file are marked for removal.
- **Merge:** imported names update matching names, new names are added, and other existing names are kept.
- Each preview row can use imported values, keep existing values where available, or be removed/skipped.
- **Cancel entire import** closes the preview without changing the current draft or database.

CSV columns: `Ticker,WeightPercent`; optional `Exchange` identifies the listing. Chinese ticker/exchange headings are also accepted. `WeightPercent=1` means 1%, not 100%.

Select the weight basis explicitly in the preview. **Within-sleeve weights** must total 100% for each sleeve. **Whole-equity weights** must total 100% for the selected complete stock list and are divided by each sleeve subtotal to obtain within-sleeve weights. The preview shows the original and converted percentages. Conversion does not change approved market allocations; those remain controlled by the annual workflow. Whole-equity mode is replace-all only to avoid mixing normalized saved weights with global CSV weights. Apply first, then edit the draft if you need to combine lists. Skipped rows must still leave a fully reconciled whole-equity list.

Every non-empty CSV row remains visible, including unknown or ambiguous securities. Leading zeroes and supported regional exchange aliases are normalized. Unknown names are never silently omitted. Invalid selected rows and duplicate identities block applying the preview; policy violations block submission.

## Editing and policy controls

The Execution Team can add, replace, remove, and change weights in an unsaved draft only at the proposed-portfolio workflow step. Saved historical versions are read-only and are not deleted by replacing a draft. Discarding the draft restores saved holdings. Counts are displayed for the whole list and separately for each market tab.

Submission validates positive weights, unique securities, allowed markets, the effective single-name limit, style-count limits, and 100% sleeve totals. The old fixed 30-name request limit is replaced by a 600-row safety bound; effective style-count policy still determines the permitted business size. Database rounding preserves each sleeve's 100% total at eight-decimal precision.

## Unknown securities

An administrator can use **Securities** to register a verified ticker, exchange, Chinese/English name, and growth/value style. Reference name and URL are optional; an empty URL receives an automatically generated reference link, not a price-scraping configuration. Names link to the reference again. Additions are audited and organization-scoped. Shared seed securities remain available.

**Check ticker and price coverage** tests live price availability and independently checks the listing venue where Yahoo metadata is available. Unknown venue metadata is explicitly flagged for human confirmation. Registration rechecks server-side: definite exchange mismatches and unavailable prices are rejected. Short-history stocks may be registered with a warning but cannot pass the unchanged 100-complete-week backtest gate. Successful registration is not investment approval.

After registration, the Execution Team selects **Refresh universe**, chooses the security in the preview, and reviews its weight. Business personnel must confirm classifications and any policy changes; backtesting still checks real price coverage.

## Upgrade and test checklist

Migrations `0020_organization_securities.sql` and `0021_security_data_coverage.sql` preserve existing shared securities and portfolio history. The latter adds nullable registration coverage evidence; old rows are marked unchecked, not fabricated as verified. Use the normal migration command during deployment. No database reset is required. Follow the existing production backup procedure before schema updates.

See [Historical Data Coverage](historical-data-coverage.md) for provider selection, completed-week alignment, and preflight behavior.

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
