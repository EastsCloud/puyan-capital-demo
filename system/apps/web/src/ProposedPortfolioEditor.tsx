import { useEffect, useMemo, useState } from "react";
import { FileUp } from "lucide-react";
import { parsePortfolioCsv, previewRows, previewHoldings, validateHoldings, sleeves, sleeveName, type Holding, type Security, type ConstructionPolicy, type ImportRow, type PreviewRow, type Sleeve } from "./proposed-portfolio-model";

export interface ProposalContext {
  universe: Security[]; policy: ConstructionPolicy; recommendedHoldings: Holding[];
  proposedPortfolioVersion: { id: string; version: number; status?: string; holdings?: Array<{ ticker: string; exchange_code: string; weight: string | number }> } | null;
}

export function ProposedPortfolioEditor({ context, zh, canEdit, busy, onSubmit, onRefresh, onDirtyChange }: {
  context: ProposalContext; zh: boolean; canEdit: boolean; busy: boolean;
  onSubmit: (holdings: Holding[]) => Promise<void>; onRefresh: () => Promise<void>; onDirtyChange: (dirty: boolean) => void;
}) {
  const [draft, setDraft] = useState<Holding[] | null>(null);
  const [activeSleeve, setActiveSleeve] = useState<Sleeve>("us");
  const [imports, setImports] = useState<ImportRow[] | null>(null);
  const [mode, setMode] = useState<"replace" | "merge">("replace");
  const [actions, setActions] = useState<Record<string, PreviewRow["action"]>>({});
  const [filename, setFilename] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const saved = useMemo(() => (context.proposedPortfolioVersion?.holdings ?? []).flatMap((holding) => {
    const security = context.universe.find((item) => item.ticker === holding.ticker && item.exchange_code === holding.exchange_code);
    return security ? [{ tickerUniverseId: security.id, weight: Number(holding.weight) }] : [];
  }), [context]);
  const holdings = draft ?? saved;
  const preview = useMemo(() => previewRows(imports ?? [], holdings, mode).map((row) => ({ ...row, action: actions[row.key] ?? row.action })), [imports, holdings, mode, actions]);
  const prepared = previewHoldings(preview, zh);
  const errors = validateHoldings(holdings, context.universe, context.policy, zh);
  const dirty = draft !== null || imports !== null;
  useEffect(() => { onDirtyChange(dirty); return () => onDirtyChange(false); }, [dirty, onDirtyChange]);
  useEffect(() => {
    const prevent = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", prevent); return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty]);
  useEffect(() => { setDraft(null); setImports(null); setMessage(null); }, [context.proposedPortfolioVersion?.id]);

  async function chooseFile(file: File | null) {
    if (!file) return;
    setMessage(null);
    try { setImports(parsePortfolioCsv(await file.text(), context.universe, zh)); setFilename(file.name); setMode("replace"); setActions({}); }
    catch (error) { setImports(null); setMessage((error as Error).message); }
  }
  async function refreshUniverse() {
    setRefreshing(true); setMessage(null);
    try { await onRefresh(); setMessage(zh ? "股票库已刷新。请在预览中选择新收录的股票。" : "Universe refreshed. Select newly registered securities in the preview."); }
    catch (error) { setMessage((error as Error).message); } finally { setRefreshing(false); }
  }
  function updateImport(key: string, change: Partial<ImportRow>) {
    setImports((current) => current?.map((row) => {
      if (row.key !== key) return row;
      const updated = { ...row, ...change };
      updated.problem = !updated.securityId ? (zh ? "请选择股票库中的对应证券" : "Select a security from the universe")
        : !Number.isFinite(updated.weight) || updated.weight <= 0 ? (zh ? "权重必须大于0" : "Weight must be positive") : null;
      return updated;
    }) ?? null);
  }
  function applyImport() {
    if (prepared.errors.length) return;
    setDraft(prepared.holdings); setImports(null); setActions({});
    setMessage(zh ? `已应用到未保存草稿，共${prepared.holdings.length}只；提交后才会写入数据库。` : `${prepared.holdings.length} names applied to an unsaved draft. Submit to save to the database.`);
  }
  function discard() {
    if (!window.confirm(zh ? "放弃所有未保存调整，恢复数据库中的拟持仓？" : "Discard unsaved changes and restore saved holdings?")) return;
    setDraft(null); setImports(null); setActions({}); setMessage(null);
  }
  async function submit() {
    if (draft === null || imports || errors.length) return;
    await onSubmit(draft);
  }
  const security = (id?: string) => context.universe.find((item) => item.id === id);
  const count = (sleeve: Sleeve) => holdings.filter((holding) => security(holding.tickerUniverseId)?.sleeve === sleeve).length;
  return <section className="annual-data-panel proposed-portfolio-panel">
    <header><div><span className="section-label">{zh ? "拟投资组合" : "Proposed portfolio"}</span><h3>{draft !== null ? (zh ? "未保存草稿" : "Unsaved draft") : context.proposedPortfolioVersion ? (zh ? `数据库已保存 · v${context.proposedPortfolioVersion.version}` : `Saved in database · v${context.proposedPortfolioVersion.version}`) : (zh ? "尚无已保存拟持仓" : "No saved proposed holdings")}</h3><p>{zh ? "导入预览和草稿不会自动保存；提交后生成新版本，历史计划保留。" : "Preview and draft changes are not saved automatically. Submission creates a new version and preserves history."}</p></div><div className="policy-badge">{zh ? `单股上限 ${context.policy.maxSingleSecurityWeightPct}%` : `Single-name max ${context.policy.maxSingleSecurityWeightPct}%`}</div></header>
    {message && <p className="form-message" role="status">{message}</p>}
    {canEdit && <>
      <div className="proposal-import"><div><FileUp size={20} /><span><strong>{zh ? "批量导入拟持仓" : "Bulk import proposed holdings"}</strong><small>{zh ? "Ticker, WeightPercent；可选 Exchange。权重为各市场组内百分比。" : "Ticker, WeightPercent; optional Exchange. Weights are percentages within each sleeve."}</small></span></div><label className="file-picker"><input type="file" accept=".csv,text/csv" disabled={busy || refreshing} onChange={(event) => { void chooseFile(event.target.files?.[0] ?? null); event.target.value = ""; }} /><span>{zh ? "选择 CSV 并预览" : "Choose CSV to preview"}</span></label><a className="secondary-button compact" href="/templates/proposed-portfolio-template.csv" download>{zh ? "下载模板" : "Download template"}</a></div>
      <div className="proposal-toolbar"><button className="secondary-button compact" disabled={busy || !!imports} onClick={() => setDraft(holdings.map((holding) => ({ ...holding })))}>{zh ? "编辑拟持仓草稿" : "Edit draft"}</button><button className="secondary-button compact" disabled={busy || !!imports} onClick={() => { setDraft(context.recommendedHoldings.map((holding) => ({ ...holding }))); setMessage(zh ? "已载入系统建议到草稿，尚未保存。" : "Recommendations loaded into an unsaved draft."); }}>{zh ? "载入系统建议" : "Load recommendations"}</button><button className="secondary-button compact" disabled={busy || refreshing} onClick={refreshUniverse}>{zh ? "刷新股票库" : "Refresh universe"}</button>{dirty && <button className="secondary-button compact" disabled={busy} onClick={discard}>{zh ? "放弃草稿，恢复已保存" : "Discard draft / restore saved"}</button>}</div>
    </>}
    {imports && canEdit && <section className="proposal-preview" aria-label={zh ? "拟持仓导入预览" : "Proposed holdings import preview"}>
      <header><h4>{zh ? `导入预览：${filename}（${imports.length}条）` : `Import preview: ${filename} (${imports.length} rows)`}</h4><p>{zh ? "尚未改变当前草稿或数据库。逐行选择使用导入值、保留原值或移除。" : "The current draft and database are unchanged. Choose imported values, keep existing values, or remove each row."}</p></header>
      <label className="proposal-mode"><span>{zh ? "导入方式" : "Import mode"}</span><select value={mode} onChange={(event) => { setMode(event.target.value as "replace" | "merge"); setActions({}); }}><option value="replace">{zh ? "全部替换（以新清单为准）" : "Replace all with the new list"}</option><option value="merge">{zh ? "合并调整（默认保留原有股票）" : "Merge (keep existing securities by default)"}</option></select></label>
      <div className="table-wrap"><table className="proposal-preview-table"><thead><tr><th>{zh ? "操作" : "Action"}</th><th>{zh ? "CSV代码 / 对应股票" : "CSV ticker / security"}</th><th>{zh ? "原权重" : "Previous weight"}</th><th>{zh ? "导入权重 (%)" : "Imported weight (%)"}</th><th>{zh ? "变化 / 提示" : "Change / issue"}</th></tr></thead><tbody>{preview.map((row) => {
        const item = security(row.imported?.securityId ?? row.existing?.tickerUniverseId);
        const change = row.action === "remove" ? (zh ? (row.existing ? "移除原有股票" : "不导入") : "Remove / skip") : row.action === "keep" ? (zh ? "保留原值" : "Keep existing") : row.existing ? (zh ? "替换权重" : "Replace weight") : (zh ? "新增股票" : "Add security");
        return <tr key={row.key} className={row.action === "remove" ? "excluded" : ""}><td><select aria-label={`${row.imported?.ticker ?? item?.ticker} action`} value={row.action} onChange={(event) => setActions({ ...actions, [row.key]: event.target.value as PreviewRow["action"] })}>{row.imported && <option value="import">{zh ? "使用导入值" : "Use imported"}</option>}{row.existing && <option value="keep">{zh ? "保留原值" : "Keep existing"}</option>}<option value="remove">{zh ? "移除 / 不导入" : "Remove / skip"}</option></select></td><td><strong>{row.imported?.ticker ?? item?.ticker}</strong>{row.imported ? <select aria-label={`${row.imported.ticker} security`} value={row.imported.securityId} disabled={row.action !== "import"} onChange={(event) => updateImport(row.key, { securityId: event.target.value })}><option value="">{zh ? "请选择对应证券" : "Select security"}</option>{context.universe.map((option) => <option key={option.id} value={option.id}>{option.ticker} · {option.exchange_code} · {zh ? option.name_zh : option.name_en}</option>)}</select> : <small>{item?.exchange_code} · {item && (zh ? item.name_zh : item.name_en)}</small>}</td><td>{row.existing ? `${(row.existing.weight * 100).toFixed(2)}%` : "—"}</td><td>{row.imported ? <input aria-label={`${row.imported.ticker} imported weight`} type="number" step="any" disabled={row.action !== "import"} value={Number.isFinite(row.imported.weight) ? Number((row.imported.weight * 100).toFixed(8)) : ""} onChange={(event) => updateImport(row.key, { weight: event.target.value === "" ? NaN : Number(event.target.value) / 100 })} /> : "—"}</td><td><strong>{change}</strong>{row.action === "import" && row.imported?.problem && <small className="result-fail">{row.imported.problem}</small>}</td></tr>;
      })}</tbody></table></div>
      {prepared.errors.length > 0 && <ul className="proposal-errors" role="alert">{prepared.errors.map((error, index) => <li key={index}>{error}</li>)}</ul>}
      <p className="readonly-note">{zh ? "股票库未收录的证券：请管理员在“股票库”补充代码、交易所、名称和风格，然后刷新股票库并选择对应项。" : "Unknown securities: ask an administrator to register ticker, exchange, name and style in Securities, then refresh the universe and select the security."}</p>
      <div className="proposal-toolbar"><button className="primary-button compact" disabled={busy || prepared.errors.length > 0} onClick={applyImport}>{zh ? `确认应用到草稿（${prepared.holdings.length}只）` : `Apply to draft (${prepared.holdings.length} names)`}</button><button className="secondary-button compact" onClick={() => { setImports(null); setActions({}); setMessage(zh ? "已取消导入，原有内容保持不变。" : "Import cancelled. Existing holdings are unchanged."); }}>{zh ? "取消全部导入" : "Cancel entire import"}</button></div>
    </section>}
    <div className="proposal-counts" role="status"><strong>{zh ? `当前${draft !== null ? "草稿" : "已保存组合"}共${holdings.length}只` : `${draft !== null ? "Draft" : "Saved portfolio"}: ${holdings.length} names`}</strong>{sleeves.map((sleeve) => <span key={sleeve}>{sleeveName(sleeve, zh)}：{count(sleeve)}</span>)}</div>
    <div className="segmented sleeve-tabs">{sleeves.map((sleeve) => <button key={sleeve} className={activeSleeve === sleeve ? "active" : ""} onClick={() => setActiveSleeve(sleeve)}>{sleeveName(sleeve, zh)} ({count(sleeve)})</button>)}</div>
    <div className="table-wrap"><table><thead><tr><th>Ticker</th><th>{zh ? "名称 / 交易所" : "Name / exchange"}</th><th>{zh ? "风格" : "Style"}</th><th>{zh ? "市场组内权重 (%)" : "Within-sleeve weight (%)"}</th>{canEdit && draft !== null && <th>{zh ? "操作" : "Action"}</th>}</tr></thead><tbody>{holdings.map((holding, index) => {
      const item = security(holding.tickerUniverseId); if (item?.sleeve !== activeSleeve) return null;
      const editable = canEdit && draft !== null && !imports && !busy;
      return <tr key={`${index}-${holding.tickerUniverseId}`}><td>{editable ? <select aria-label={`${item.ticker} security`} value={item.id} onChange={(event) => setDraft(holdings.map((entry, rowIndex) => rowIndex === index ? { ...entry, tickerUniverseId: event.target.value } : entry))}>{context.universe.filter((option) => option.sleeve === activeSleeve).map((option) => <option key={option.id} value={option.id}>{option.ticker} · {option.exchange_code}</option>)}</select> : <strong>{item.ticker}</strong>}</td><td>{zh ? item.name_zh : item.name_en}<small>{item.exchange_code}</small></td><td>{item.style === "growth" ? (zh ? "成长" : "Growth") : (zh ? "价值" : "Value")}</td><td>{editable ? <input aria-label={`${item.ticker} weight`} type="number" min="0" step="any" value={Number.isFinite(holding.weight) ? Number((holding.weight * 100).toFixed(8)) : ""} onChange={(event) => setDraft(holdings.map((entry, rowIndex) => rowIndex === index ? { ...entry, weight: event.target.value === "" ? NaN : Number(event.target.value) / 100 } : entry))} /> : `${(holding.weight * 100).toFixed(2)}%`}</td>{canEdit && draft !== null && <td><button className="secondary-button compact" disabled={!editable} onClick={() => setDraft(holdings.filter((_, rowIndex) => rowIndex !== index))}>{zh ? "删除草稿股票" : "Remove from draft"}</button></td>}</tr>;
    })}</tbody><tfoot><tr><td colSpan={3}>{zh ? "当前市场组合计" : "Current sleeve total"}</td><td>{(holdings.reduce((sum, holding) => sum + (security(holding.tickerUniverseId)?.sleeve === activeSleeve ? holding.weight : 0), 0) * 100).toFixed(2)}%</td></tr></tfoot></table></div>
    {canEdit && draft !== null && !imports && <label className="proposal-add"><span>{zh ? "新增草稿股票" : "Add to draft"}</span><select aria-label={zh ? "新增草稿股票" : "Add security to draft"} value="" disabled={busy} onChange={(event) => { if (event.target.value) setDraft([...holdings, { tickerUniverseId: event.target.value, weight: 0 }]); }}><option value="">{zh ? "选择当前市场的股票" : "Choose a security in this sleeve"}</option>{context.universe.filter((item) => item.sleeve === activeSleeve && !holdings.some((holding) => holding.tickerUniverseId === item.id)).map((item) => <option key={item.id} value={item.id}>{item.ticker} · {item.exchange_code} · {zh ? item.name_zh : item.name_en}</option>)}</select></label>}
    {draft !== null && errors.length > 0 && <ul className="proposal-errors" role="alert">{errors.map((error, index) => <li key={index}>{error}</li>)}</ul>}
    <div className="proposal-controls"><span>{zh ? `每个市场的每种风格 ${context.policy.styleTickerMin}–${context.policy.styleTickerMax} 只；各市场组内权重分别合计100%。` : `${context.policy.styleTickerMin}–${context.policy.styleTickerMax} names per style per sleeve; each sleeve must total 100%.`}</span>{canEdit && <button className="primary-button compact" disabled={busy || draft === null || !!imports || errors.length > 0} onClick={submit}>{zh ? "提交草稿并进入回测" : "Submit draft for backtest"}</button>}</div>
    {!canEdit && <p className="readonly-note">{zh ? "只读：只有执行小组可在拟投资组合步骤编辑新版本，历史计划不能直接删除。" : "Read only: the execution team can edit a new version at the proposed-portfolio step. Historical plans cannot be deleted."}</p>}
  </section>;
}
