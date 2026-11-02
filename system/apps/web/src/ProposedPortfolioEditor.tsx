import { useEffect, useMemo, useState } from "react";
import { FileUp } from "lucide-react";
import {compareDraftHoldings} from './proposal-changes';
import { convertImportWeights, parsePortfolioCsv, previewRows, previewHoldings, validateHoldings, sleeves, sleeveName, type Holding, type Security, type ConstructionPolicy, type ImportRow, type PreviewRow, type Sleeve } from "./proposed-portfolio-model";

export interface StockRecommendation {
  modelVersion: string; scenario: 'bull' | 'balanced' | 'bear'; generatedAt: string;
  universeCount: number; eligibleCount: number; ready: boolean; holdings: Holding[]; issues: string[];
  profile: { growthWeight: number; return: number; momentum: number; volatility: number; drawdown: number };
  excluded: Array<{ tickerUniverseId: string; ticker: string; reason: string }>;
  candidates: Array<{ id: string; ticker: string; name_zh?:string;name_en?:string; sleeve: string; style: string; score: number; annualizedReturn: number;
    momentum: number; momentumWeeks: number; volatility: number; maximumDrawdown: number; observations: number;
    firstDate: string; lastDate: string; sourceName: string; sourceUrl: string; fallbackReason: string | null;
    returnCalculation?:{firstPrice:number;lastPrice:number;elapsedWeeks:number;cumulativeReturn:number} }>;
}

export interface ProposalContext {
  universe: Security[]; policy: ConstructionPolicy; recommendedHoldings: Holding[];
  approvedSleeveWeights?: Partial<Record<Sleeve, number>>;
  archiveSeed?:Array<{ticker:string;exchangeCode:string;weightPercent:number}>|null;
  proposedPortfolioVersion: { id: string; version: number; status?: string; change_summary?:{changed:boolean}; holdings?: Array<{ ticker: string; exchange_code: string; weight: string | number;locked?:boolean }> } | null;
}

export function ProposedPortfolioEditor({ context, zh, canEdit, busy, onSubmit, onRefresh, onRecommend, onDirtyChange,copyFrom }: {
  context: ProposalContext; zh: boolean; canEdit: boolean; busy: boolean;
  onSubmit: (holdings: Holding[]) => Promise<void>; onRefresh: () => Promise<void>; onDirtyChange: (dirty: boolean) => void;
  onRecommend: () => Promise<StockRecommendation>;
  copyFrom?:{id:string;version:number;holdings:Array<{ticker:string;exchange_code:string;weight:string|number}>}|null;
}) {
  const [draft, setDraft] = useState<Holding[] | null>(null);
  const [activeSleeve, setActiveSleeve] = useState<Sleeve>("us");
  const [imports, setImports] = useState<ImportRow[] | null>(null);
  const [mode, setMode] = useState<"replace" | "merge">("replace");
  const [weightBasis, setWeightBasis] = useState<"sleeve" | "portfolio">("sleeve");
  const [actions, setActions] = useState<Record<string, PreviewRow["action"]>>({});
  const [filename, setFilename] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [recommending, setRecommending] = useState(false);
  const [recommendation, setRecommendation] = useState<StockRecommendation | null>(null);
  const saved = useMemo(() => (context.proposedPortfolioVersion?.holdings ?? []).flatMap((holding) => {
    const security = context.universe.find((item) => item.ticker === holding.ticker && item.exchange_code === holding.exchange_code);
    return security ? [{ tickerUniverseId: security.id, weight: Number(holding.weight) }] : [];
  }), [context]);
  const holdings = draft ?? saved;
  const changes=compareDraftHoldings(saved,holdings);
  const lockedIds=new Set((context.proposedPortfolioVersion?.holdings??[]).filter(h=>h.locked).flatMap(h=>context.universe.filter(s=>s.ticker===h.ticker&&s.exchange_code===h.exchange_code).map(s=>s.id)));
  const unmapped=(context.proposedPortfolioVersion?.holdings?.length??0)-saved.length;
  const preview = useMemo(() => previewRows(imports ?? [], holdings, mode).map((row) => ({ ...row, action: actions[row.key] ?? row.action })), [imports, holdings, mode, actions]);
  const rawPrepared = previewHoldings(preview, zh);
  const converted = convertImportWeights(rawPrepared.holdings, context.universe, weightBasis, zh);
  const prepared = { holdings: converted.holdings, errors: [...rawPrepared.errors, ...converted.errors] };
  const errors = validateHoldings(holdings, context.universe, context.policy, zh);
  const dirty = changes.changed || imports !== null;
  useEffect(() => { onDirtyChange(dirty); return () => onDirtyChange(false); }, [dirty, onDirtyChange]);
  useEffect(() => {
    const prevent = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", prevent); return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty]);
  useEffect(() => { setDraft(null); setImports(null); setMessage(null); }, [context.proposedPortfolioVersion?.id]);
  useEffect(()=>{
    if(!copyFrom||!canEdit)return;
    const mapped=copyFrom.holdings.map(h=>({security:context.universe.find(s=>s.ticker===h.ticker&&s.exchange_code===h.exchange_code),weight:Number(h.weight)}));
    if(mapped.some(h=>!h.security)){setMessage(zh?'历史方案有股票不在当前可用股票库，未载入；请管理员核对。':'Historical securities are unavailable in the current universe; nothing was loaded.');return;}
    setDraft(mapped.map(h=>({tickerUniverseId:h.security!.id,weight:h.weight})));setImports(null);setMessage(zh?`已将历史 v${copyFrom.version} 复制为未保存草稿，历史回测不会用于新版本。`:`Historical v${copyFrom.version} copied to an unsaved draft. Old backtests will not validate a changed version.`);
  },[copyFrom,canEdit,context.proposedPortfolioVersion?.id]);

  async function chooseFile(file: File | null) {
    if (!file) return;
    setMessage(null);
    try { setImports(parsePortfolioCsv(await file.text(), context.universe, zh)); setFilename(file.name); setMode("replace"); setWeightBasis("sleeve"); setActions({}); }
    catch (error) { setImports(null); setMessage((error as Error).message); }
  }
  async function refreshUniverse() {
    setRefreshing(true); setMessage(null);
    try { await onRefresh(); setRecommendation(null); setMessage(zh ? "股票库已刷新。请在预览中选择新收录的股票。" : "Universe refreshed. Select newly registered securities in the preview."); }
    catch (error) { setMessage((error as Error).message); } finally { setRefreshing(false); }
  }
  async function generateRecommendation() {
    setRecommending(true); setMessage(null); setRecommendation(null);
    try { setRecommendation(await onRecommend()); }
    catch (error) { setMessage((error as Error).message); }
    finally { setRecommending(false); }
  }
  function loadRecommendation() {
    if (!recommendation?.ready) return;
    if ([...lockedIds].some(id => {
      const savedHolding = saved.find(item => item.tickerUniverseId === id);
      const next = recommendation.holdings.find(item => item.tickerUniverseId === id);
      return !next || Math.abs(next.weight - savedHolding!.weight) > .000000005;
    })) { setMessage(zh ? '建议会改变已锁定股票，未载入；请保留锁定持仓并手动调整草稿。' : 'Recommendation changes locked holdings and was not loaded. Preserve locks and edit the draft manually.'); return; }
    setDraft(recommendation.holdings.map(item => ({ ...item })));
    setMessage(zh ? '已载入情景建议到未保存草稿，仍需提交、回测及审批。' : 'Scenario recommendation loaded into an unsaved draft. Submission, backtest and approval are still required.');
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
    {canEdit&&context.archiveSeed?.length&&!context.proposedPortfolioVersion&&<div className="readonly-note"><p>{zh?'本档案含复制的拟持仓配置，尚未写入正式拟持仓。载入时只保留各市场内的相对权重，市场总比例仍采用本档案确认的目标。':'Copied holdings are available, not saved as a formal proposal. Loading preserves relative weights within each market; the newly approved market allocations still apply.'}</p><button className="secondary-button compact" disabled={busy||!!imports} onClick={()=>{const source=context.archiveSeed!.map(h=>({item:context.universe.find(s=>s.ticker===h.ticker&&s.exchange_code===h.exchangeCode),weight:h.weightPercent}));if(source.some(h=>!h.item)){setMessage(zh?'复制清单有股票不在当前股票库，请先核对，未载入。':'Copied securities are unavailable in the current catalogue; nothing loaded.');return;}setDraft(source.map(h=>({tickerUniverseId:h.item!.id,weight:h.weight/source.filter(s=>s.item!.sleeve===h.item!.sleeve).reduce((n,s)=>n+s.weight,0)})));setMessage(zh?'已载入未保存草稿，仍需校验并提交。':'Copied holdings loaded into an unsaved draft; validation and submission are still required.');}}>{zh?'载入复制的拟持仓':'Load copied holdings'}</button></div>}
    <header><div><span className="section-label">{zh ? "拟投资组合" : "Proposed portfolio"}</span><h3>{draft !== null ? (zh ? (changes.changed?"未保存草稿":"草稿未修改") : (changes.changed?"Unsaved draft":"Unchanged draft")) : context.proposedPortfolioVersion ? (zh ? `数据库已保存 · v${context.proposedPortfolioVersion.version}` : `Saved in database · v${context.proposedPortfolioVersion.version}`) : (zh ? "尚无已保存拟持仓" : "No saved proposed holdings")}</h3><p>{zh ? "导入预览不会改变组合。仅提交有修改的草稿时生成新版本；未修改则沿用原版本，历史记录保留。" : "Preview does not change the portfolio. Changed drafts create new versions; unchanged drafts reuse the saved version. History is retained."}</p></div><div className="policy-badge">{zh ? `单股上限 ${context.policy.maxSingleSecurityWeightPct}%` : `Single-name max ${context.policy.maxSingleSecurityWeightPct}%`}</div></header>
    <p className="readonly-note proposal-change-status" role="status">{imports?(zh?'导入预览未应用，数据库未修改。':'Import preview not applied; database unchanged.'):changes.changed?(zh?`已修改（尚未保存）：新增 ${changes.added.length}，删除 ${changes.removed.length}，权重调整 ${changes.modified.length}。旧回测不能验证此草稿。`:`Modified, not saved: ${changes.added.length} added, ${changes.removed.length} removed, ${changes.modified.length} reweighted. Old backtests do not validate this draft.`):(zh?'未修改：与数据库已保存组合一致。':'Unchanged: matches the saved database portfolio.')}{context.proposedPortfolioVersion?.status==='submitted'&&<strong>{zh?' 已保存版本待回测。':' Saved version awaits backtesting.'}</strong>}</p>
    {unmapped>0&&<p className="form-error">{zh?`${unmapped} 只已保存股票不在当前可用股票库，禁止提交以免误删，请管理员核对。`:`${unmapped} saved securities are unavailable. Submission is blocked to prevent silent deletion.`}</p>}
    {changes.removed.length>0&&<p className="pending-note">{zh?'草稿拟删除（未保存）：':'Removed in draft (not saved): '}{changes.removed.map(id=>context.universe.find(s=>s.id===id)?.ticker??id).join(', ')}</p>}
    {message && <p className="form-message" role="status">{message}</p>}
    {canEdit && <>
      <div className="proposal-import"><div><FileUp size={20} /><span><strong>{zh ? "批量导入拟持仓" : "Bulk import proposed holdings"}</strong><small>{zh ? "Ticker, WeightPercent；可选 Exchange。预览中选择全股票组合权重或各市场组内权重。" : "Ticker, WeightPercent; optional Exchange. Choose whole-equity or within-sleeve percentages in the preview."}</small></span></div><label className="file-picker"><input type="file" accept=".csv,text/csv" disabled={busy || refreshing} onChange={(event) => { void chooseFile(event.target.files?.[0] ?? null); event.target.value = ""; }} /><span>{zh ? "选择 CSV 并预览" : "Choose CSV to preview"}</span></label><a className="secondary-button compact" href="/templates/proposed-portfolio-template.csv" download>{zh ? "下载模板" : "Download template"}</a></div>
      <div className="proposal-toolbar"><button className="secondary-button compact" disabled={busy || !!imports} onClick={() => setDraft(holdings.map((holding) => ({ ...holding })))}>{zh ? "编辑拟持仓草稿" : "Edit draft"}</button><button className="secondary-button compact" disabled={busy || refreshing || recommending} onClick={generateRecommendation}>{recommending ? (zh ? '正在检查股票库行情…' : 'Checking catalogue prices…') : (zh ? '按当前情景生成建议' : 'Generate scenario recommendation')}</button><button className="secondary-button compact" disabled={busy || !!imports || recommending || !recommendation?.ready} onClick={loadRecommendation}>{zh ? "载入系统建议" : "Load recommendations"}</button><button className="secondary-button compact" disabled={busy || refreshing || recommending} onClick={refreshUniverse}>{zh ? "刷新股票库" : "Refresh universe"}</button>{dirty && <button className="secondary-button compact" disabled={busy} onClick={discard}>{zh ? "放弃草稿，恢复已保存" : "Discard draft / restore saved"}</button>}</div>
    </>}
    <p className="readonly-note">{zh ? `系统从本组织股票库 ${context.universe.length} 只已启用证券中筛选。牛市偏重收益与动量，熊市偏重低波动与低回撤，平衡市兼顾；成长/价值目标分别为60/40、40/60、50/50，并受单股上限约束。相同股票仍可能入选。建议需经回测验证。` : `Screening uses ${context.universe.length} enabled catalogue securities. Bull prioritizes return and momentum; bear prioritizes lower volatility and drawdown; balanced combines them. Growth/value targets are 60/40, 40/60 and 50/50, subject to weight caps. Securities may overlap. A backtest is required.`}</p>
    {recommendation && <section className="proposal-recommendation" aria-label={zh ? '情景选股建议' : 'Scenario stock recommendation'}>
      <h4>{({ bull: zh ? '牛市' : 'Bull', balanced: zh ? '平衡市' : 'Balanced', bear: zh ? '熊市' : 'Bear' })[recommendation.scenario]} · {zh ? `股票库 ${recommendation.universeCount} 只，可评分 ${recommendation.eligibleCount} 只，建议 ${recommendation.holdings.length} 只` : `${recommendation.universeCount} catalogue, ${recommendation.eligibleCount} scored, ${recommendation.holdings.length} selected`}</h4>
      <p>{recommendation.modelVersion} · {new Date(recommendation.generatedAt).toLocaleString(zh ? 'zh-CN' : 'en-US')}</p>
      <p>{zh ? `评分权重：年化收益 ${recommendation.profile.return * 100}%，26周动量 ${recommendation.profile.momentum * 100}%，低波动 ${recommendation.profile.volatility * 100}%，低回撤 ${recommendation.profile.drawdown * 100}%。同一市场、同一风格内按百分位排名，选择得分最高的股票。` : `Score weights: annual return ${recommendation.profile.return * 100}%, 26-week momentum ${recommendation.profile.momentum * 100}%, lower volatility ${recommendation.profile.volatility * 100}%, lower drawdown ${recommendation.profile.drawdown * 100}%. Highest percentile scores within each sleeve/style are selected.`}</p>
      {recommendation.issues.map(issue => <p className="form-error" key={issue}>{issue}</p>)}
      <details className="source-details"><summary>{zh ? '查看候选评分、入选权重及排除原因' : 'View candidate scores, weights and exclusions'}</summary>
        <div className="table-wrap"><table><thead><tr>{(zh ? ['中文名称', '股票', '市场 / 风格', '得分', '年化收益', '26周动量', '年化波动', '最大回撤', '建议组内权重', '行情区间 / 来源'] : ['Name', 'Security', 'Sleeve / style', 'Score', 'Annual return', '26-week momentum', 'Volatility', 'Max drawdown', 'Sleeve weight', 'History / source']).map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{recommendation.candidates.map(item => {
          const weight = recommendation.holdings.find(holding => holding.tickerUniverseId === item.id)?.weight;
          return <tr key={item.id}><td>{item.name_zh || context.universe.find(security=>security.id===item.id)?.name_zh || item.name_en || item.ticker}</td><td>{item.ticker}</td><td>{sleeveName(item.sleeve as Sleeve, zh)} / {item.style === 'growth' ? (zh ? '成长' : 'Growth') : (zh ? '价值' : 'Value')}</td><td>{item.score.toFixed(3)}</td><td>{(item.annualizedReturn * 100).toFixed(2)}%{item.returnCalculation&&<details><summary>{zh?"计算过程":"Calculation"}</summary><small>({item.returnCalculation.lastPrice.toPrecision(12)} / {item.returnCalculation.firstPrice.toPrecision(12)}) ^ (52 / {item.returnCalculation.elapsedWeeks}) − 1 = {(item.annualizedReturn*100).toFixed(8)}%</small></details>}</td><td>{(item.momentum * 100).toFixed(2)}%<small>{zh ? `实际 ${item.momentumWeeks} 周` : `${item.momentumWeeks} elapsed weeks`}</small></td><td>{(item.volatility * 100).toFixed(2)}%</td><td>{(item.maximumDrawdown * 100).toFixed(2)}%</td><td>{weight ? `${(weight * 100).toFixed(2)}%` : '—'}</td><td>{item.firstDate} – {item.lastDate} ({item.observations})<small>{/^https?:\/\//.test(item.sourceUrl) ? <a href={item.sourceUrl} target="_blank" rel="noreferrer">{item.sourceName}</a> : item.sourceName}</small>{item.fallbackReason && <small>{item.fallbackReason}</small>}</td></tr>;
        })}</tbody></table></div>
        {recommendation.excluded.map(item => <p key={item.tickerUniverseId}>{item.ticker}: {item.reason}</p>)}
      </details>
    </section>}
    {imports && canEdit && <section className="proposal-preview" aria-label={zh ? "拟持仓导入预览" : "Proposed holdings import preview"}>
      <header><h4>{zh ? `导入预览：${filename}（${imports.length}条）` : `Import preview: ${filename} (${imports.length} rows)`}</h4><p>{zh ? "尚未改变当前草稿或数据库。逐行选择使用导入值、保留原值或移除。" : "The current draft and database are unchanged. Choose imported values, keep existing values, or remove each row."}</p></header>
      <label className="proposal-weight-basis"><span>{zh ? "CSV 权重含义（请明确选择）" : "CSV weight basis (select explicitly)"}</span><select value={weightBasis} onChange={event => { setWeightBasis(event.target.value as "sleeve" | "portfolio"); setMode("replace"); setActions({}); }}><option value="sleeve">{zh ? "市场组内权重（每组100%）" : "Within-sleeve weights (100% each)"}</option><option value="portfolio">{zh ? "全股票组合权重（整表100%）" : "Whole-equity weights (100% total)"}</option></select></label>
      <label className="proposal-mode"><span>{zh ? "导入方式" : "Import mode"}</span><select value={mode} onChange={(event) => { setMode(event.target.value as "replace" | "merge"); setActions({}); }}><option value="replace">{zh ? "全部替换（以新清单为准）" : "Replace all with the new list"}</option><option value="merge" disabled={weightBasis === "portfolio"}>{zh ? "合并调整（默认保留原有股票）" : "Merge (keep existing securities by default)"}</option></select></label>
      {weightBasis === "portfolio" && <p className="readonly-note">{zh ? "将按各市场小计换算为组内100%。此模式用于完整清单全部替换；需保留旧股时请先转换到草稿再编辑。不改变已确认的市场配置比例。" : "Normalize each sleeve to 100%. Whole-equity mode replaces the full list; apply first, then edit to keep old names. Approved market allocations are not changed."}{converted.totals.map(group => <span key={group.sleeve}> {sleeveName(group.sleeve, zh)}：{(group.total * 100).toFixed(2)}%</span>)}</p>}
      {weightBasis === "portfolio" && context.approvedSleeveWeights && <p className="pending-note">{zh ? "后续执行仍使用已确认的股票市场配置（不会采用CSV市场小计覆盖）：" : "Execution retains approved equity-market allocations, not CSV subtotals: "}{sleeves.map(sleeve => <span key={sleeve}> {sleeveName(sleeve, zh)}：{((context.approvedSleeveWeights?.[sleeve] ?? 0) * 100).toFixed(2)}%</span>)}</p>}
      <div className="table-wrap"><table className="proposal-preview-table"><thead><tr><th>{zh ? "操作" : "Action"}</th><th>{zh ? "CSV代码 / 对应股票" : "CSV ticker / security"}</th><th>{zh ? "原权重" : "Previous weight"}</th><th>{zh ? "导入权重 (%)" : "Imported weight (%)"}</th><th>{zh ? "应用后组内权重" : "Applied sleeve weight"}</th><th>{zh ? "变化 / 提示" : "Change / issue"}</th></tr></thead><tbody>{preview.map((row) => {
        const item = security(row.imported?.securityId ?? row.existing?.tickerUniverseId);
        const change = row.action === "remove" ? (zh ? (row.existing ? "移除原有股票" : "不导入") : "Remove / skip") : row.action === "keep" ? (zh ? "保留原值" : "Keep existing") : row.existing ? (zh ? "替换权重" : "Replace weight") : (zh ? "新增股票" : "Add security");
        return <tr key={row.key} className={row.action === "remove" ? "excluded" : ""}><td><select aria-label={`${row.imported?.ticker ?? item?.ticker} action`} value={row.action} onChange={(event) => setActions({ ...actions, [row.key]: event.target.value as PreviewRow["action"] })}>{row.imported && <option value="import">{zh ? "使用导入值" : "Use imported"}</option>}{row.existing && weightBasis === "sleeve" && <option value="keep">{zh ? "保留原值" : "Keep existing"}</option>}<option value="remove">{zh ? "移除 / 不导入" : "Remove / skip"}</option></select></td><td><strong>{row.imported?.ticker ?? item?.ticker}</strong>{row.imported ? <select aria-label={`${row.imported.ticker} security`} value={row.imported.securityId} disabled={row.action !== "import"} onChange={(event) => updateImport(row.key, { securityId: event.target.value })}><option value="">{zh ? "请选择对应证券" : "Select security"}</option>{context.universe.map((option) => <option key={option.id} value={option.id}>{option.ticker} · {option.exchange_code} · {zh ? option.name_zh : option.name_en}</option>)}</select> : <small>{item?.exchange_code} · {item && (zh ? item.name_zh : item.name_en)}</small>}</td><td>{row.existing ? `${(row.existing.weight * 100).toFixed(2)}%` : "—"}</td><td>{row.imported ? <input aria-label={`${row.imported.ticker} imported weight`} type="number" step="any" disabled={row.action !== "import"} value={Number.isFinite(row.imported.weight) ? Number((row.imported.weight * 100).toFixed(8)) : ""} onChange={(event) => updateImport(row.key, { weight: event.target.value === "" ? NaN : Number(event.target.value) / 100 })} /> : "—"}</td><td>{row.action !== "remove" && item ? `${((prepared.holdings.find(holding => holding.tickerUniverseId === item.id)?.weight ?? 0) * 100).toFixed(4)}%` : "—"}</td><td><strong>{change}</strong>{row.action === "import" && row.imported?.problem && <small className="result-fail">{row.imported.problem}</small>}</td></tr>;
      })}</tbody></table></div>
      {prepared.errors.length > 0 && <ul className="proposal-errors" role="alert">{prepared.errors.map((error, index) => <li key={index}>{error}</li>)}</ul>}
      <p className="readonly-note">{zh ? "股票库未收录的证券：请管理员在“股票库”补充代码、交易所、名称和风格，然后刷新股票库并选择对应项。" : "Unknown securities: ask an administrator to register ticker, exchange, name and style in Securities, then refresh the universe and select the security."}</p>
      <div className="proposal-toolbar"><button className="primary-button compact" disabled={busy || prepared.errors.length > 0} onClick={applyImport}>{zh ? `确认应用到草稿（${prepared.holdings.length}只）` : `Apply to draft (${prepared.holdings.length} names)`}</button><button className="secondary-button compact" onClick={() => { setImports(null); setActions({}); setMessage(zh ? "已取消导入，原有内容保持不变。" : "Import cancelled. Existing holdings are unchanged."); }}>{zh ? "取消全部导入" : "Cancel entire import"}</button></div>
    </section>}
    <div className="proposal-counts" role="status"><strong>{zh ? `当前${draft !== null ? "草稿" : "已保存组合"}共${holdings.length}只` : `${draft !== null ? "Draft" : "Saved portfolio"}: ${holdings.length} names`}</strong>{sleeves.map((sleeve) => <span key={sleeve}>{sleeveName(sleeve, zh)}：{count(sleeve)}</span>)}</div>
    <div className="segmented sleeve-tabs">{sleeves.map((sleeve) => <button key={sleeve} className={activeSleeve === sleeve ? "active" : ""} onClick={() => setActiveSleeve(sleeve)}>{sleeveName(sleeve, zh)} ({count(sleeve)})</button>)}</div>
    <div className="table-wrap"><table><thead><tr><th>Ticker</th><th>{zh ? "名称 / 交易所" : "Name / exchange"}</th><th>{zh ? "风格" : "Style"}</th><th>{zh ? "相对已保存版本" : "Compared with saved version"}</th><th>{zh ? "市场组内权重 (%)" : "Within-sleeve weight (%)"}</th>{canEdit && draft !== null && <th>{zh ? "操作" : "Action"}</th>}</tr></thead><tbody>{holdings.map((holding, index) => {
      const item = security(holding.tickerUniverseId); if (item?.sleeve !== activeSleeve) return null;
      const editable = canEdit && draft !== null && !imports && !busy && !lockedIds.has(holding.tickerUniverseId);
      return <tr key={`${index}-${holding.tickerUniverseId}`}><td>{editable ? <select aria-label={`${item.ticker} security`} value={item.id} onChange={(event) => setDraft(holdings.map((entry, rowIndex) => rowIndex === index ? { ...entry, tickerUniverseId: event.target.value } : entry))}>{context.universe.filter((option) => option.sleeve === activeSleeve).map((option) => <option key={option.id} value={option.id}>{option.ticker} · {option.exchange_code}</option>)}</select> : <strong>{item.ticker}</strong>}</td><td>{/^https?:\/\//.test(item.source_url) ? <a href={item.source_url} target="_blank" rel="noreferrer">{zh ? item.name_zh : item.name_en}</a> : (zh ? item.name_zh : item.name_en)}<small>{item.exchange_code}</small></td><td>{item.style === "growth" ? (zh ? "成长" : "Growth") : (zh ? "价值" : "Value")}</td><td><strong className={changes.added.includes(holding.tickerUniverseId)||changes.modified.includes(holding.tickerUniverseId)?"proposal-modified":"result-pass"}>{changes.added.includes(holding.tickerUniverseId)?(zh?"新增":"Added"):changes.modified.includes(holding.tickerUniverseId)?(zh?"已修改":"Modified"):(zh?"未修改":"Unchanged")}</strong>{lockedIds.has(holding.tickerUniverseId)&&<small>{zh?"已锁定":"Locked"}</small>}</td><td>{editable ? <input aria-label={`${item.ticker} weight`} type="number" min="0" step="any" value={Number.isFinite(holding.weight) ? Number((holding.weight * 100).toFixed(8)) : ""} onChange={(event) => setDraft(holdings.map((entry, rowIndex) => rowIndex === index ? { ...entry, weight: event.target.value === "" ? NaN : Number(event.target.value) / 100 } : entry))} /> : `${(holding.weight * 100).toFixed(2)}%`}</td>{canEdit && draft !== null && <td><button className="secondary-button compact" disabled={!editable} onClick={() => setDraft(holdings.filter((_, rowIndex) => rowIndex !== index))}>{zh ? "删除草稿股票" : "Remove from draft"}</button></td>}</tr>;
    })}</tbody><tfoot><tr><td colSpan={4}>{zh ? "当前市场组合计" : "Current sleeve total"}</td><td>{(holdings.reduce((sum, holding) => sum + (security(holding.tickerUniverseId)?.sleeve === activeSleeve ? holding.weight : 0), 0) * 100).toFixed(2)}%</td></tr></tfoot></table></div>
    {canEdit && draft !== null && !imports && <label className="proposal-add"><span>{zh ? "新增草稿股票" : "Add to draft"}</span><select aria-label={zh ? "新增草稿股票" : "Add security to draft"} value="" disabled={busy} onChange={(event) => { if (event.target.value) setDraft([...holdings, { tickerUniverseId: event.target.value, weight: 0 }]); }}><option value="">{zh ? "选择当前市场的股票" : "Choose a security in this sleeve"}</option>{context.universe.filter((item) => item.sleeve === activeSleeve && !holdings.some((holding) => holding.tickerUniverseId === item.id)).map((item) => <option key={item.id} value={item.id}>{item.ticker} · {item.exchange_code} · {zh ? item.name_zh : item.name_en}</option>)}</select></label>}
    {draft !== null && errors.length > 0 && <ul className="proposal-errors" role="alert">{errors.map((error, index) => <li key={index}>{error}</li>)}</ul>}
    <div className="proposal-controls"><span>{zh ? `每个市场的每种风格 ${context.policy.styleTickerMin}–${context.policy.styleTickerMax} 只；各市场组内权重分别合计100%。` : `${context.policy.styleTickerMin}–${context.policy.styleTickerMax} names per style per sleeve; each sleeve must total 100%.`}</span>{canEdit && <button className="primary-button compact" disabled={busy || draft === null || !!imports || errors.length > 0 || unmapped>0} onClick={submit}>{changes.changed?(zh ? "提交草稿并进入回测" : "Submit draft for backtest"):(zh?"未修改，沿用此版本并进入回测":"Unchanged: reuse this version for backtest")}</button>}</div>
    {!canEdit && <p className="readonly-note">{zh ? "只读：只有执行小组可在拟投资组合步骤编辑新版本，历史计划不能直接删除。" : "Read only: the execution team can edit a new version at the proposed-portfolio step. Historical plans cannot be deleted."}</p>}
  </section>;
}
