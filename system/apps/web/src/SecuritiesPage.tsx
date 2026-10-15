import { useEffect, useState,useRef, type FormEvent } from "react";
import type { Security } from "./proposed-portfolio-model";

interface SecurityValidation {
  ticker: string; exchangeMatches: boolean | null; listingExchange: string; listingNote: string | null;
  coverage: { provider: string; observations: number; status: string; firstDate: string | null; lastDate: string | null; reason: string | null; fallbackReason: string | null };
}
export function SecuritiesPage({ zh, request }: { zh: boolean; request: <T>(path: string, init?: RequestInit) => Promise<T> }) {
  const [securities, setSecurities] = useState<Security[]>([]);
  const [validation, setValidation] = useState<SecurityValidation | null>(null);
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState<string | null>(null);
  const [editing,setEditing]=useState<Security|null>(null);const [reason,setReason]=useState('');const formRef=useRef<HTMLFormElement>(null);
  const emptyForm={ticker:'',exchangeCode:'NASDAQ',nameEn:'',nameZh:'',style:'growth',sourceName:'',sourceUrl:'',tradingLotSize:''};
  const [form, setForm] = useState(emptyForm);
  function edit(security:Security){if(!security.updated_at){setMessage(zh?'请刷新以读取最新资料版本。':'Refresh to load the current data version.');return;}setEditing(security);setReason('');setValidation(null);setMessage(null);setForm({ticker:security.ticker,exchangeCode:security.exchange_code,nameEn:security.name_en,nameZh:security.name_zh,style:security.style,sourceName:security.source_name??'',sourceUrl:security.source_url,tradingLotSize:security.trading_lot_size?String(security.trading_lot_size):''});formRef.current?.scrollIntoView({behavior:'smooth',block:'start'});}
  const load = async () => setSecurities((await request<{ securities: Security[] }>("/api/securities")).securities);
  useEffect(() => { void load().catch((error: Error) => setMessage(error.message)); }, []);
  async function checkCoverage() {
    setBusy(true); setMessage(null); setValidation(null);
    try { setValidation((await request<{ validation: SecurityValidation }>("/api/admin/securities/check", { method: "POST", body: JSON.stringify({ ticker: form.ticker, exchangeCode: form.exchangeCode }) })).validation); }
    catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage(null);
    try {
      const result = await request<{ validation: SecurityValidation;identityCorrection?:unknown }>(editing?`/api/admin/securities/${editing.id}`:"/api/admin/securities", { method:editing?'PATCH':"POST", body: JSON.stringify({...form,tradingLotSize:form.tradingLotSize?Number(form.tradingLotSize):null,...(editing?{expectedUpdatedAt:editing.updated_at,reason}:{})}) });
      setValidation(result.validation);
      await load(); setForm(emptyForm);setEditing(null);setReason('');
      setMessage(editing?(zh?`修改已保存并留痕，仅对本团队生效。${result.identityCorrection?'同一股票的交易所更正会用于后续成交核对。':''}历史批准计划及已导入回单未被改写；请重新预览并导入受影响的回单。`:'Changes saved with audit history for this organization only. Historical plans/fill imports were not rewritten; preview and reimport affected fills.'):(zh ? "股票已收录。执行小组可在导入预览中刷新股票库并选择；不会自动加入任何投资组合。" : "Security registered. The execution team can refresh the import preview and select it. No portfolio was changed."));
    } catch (error) {
      const details = (error as Error & { body?: { validation?: SecurityValidation } }).body?.validation;
      if (details) setValidation(details);
      setMessage((error as Error).message);
    } finally { setBusy(false); }
  }
  return <section className="annual-data-panel securities-panel"><header><div><span className="section-label">{zh ? "管理员维护" : "Administrator maintenance"}</span><h3>{zh ? "股票库" : "Securities"}</h3><p>{zh ? "补充未收录股票，请核实代码、交易所和风格。新增资料仅供本团队使用，不修改历史持仓；收录前核验真实价格与上市交易所。历史不足100周可收录；回测需检查并明确确认可用短历史。资料网址可留空，将自动提供参考链接。" : "Verify ticker, exchange and style before registration. New entries belong to your organization, preserve historical holdings and are checked against live prices and listing venues. Short histories may be registered; backtesting requires coverage checks and explicit available-history consent. Reference fields are optional."}</p></div></header>
    {editing&&<p className="readonly-note" role="status">{zh?`正在修改 ${editing.ticker} · ${editing.exchange_code}。修改库资料不会改写历史计划。只有同一代码、同一市场内的交易所更正可关联后续核对；换代码或跨市场需重新确认交易计划。`:`Editing ${editing.ticker} · ${editing.exchange_code}. Historical plans stay unchanged. Only a verified same-ticker/same-market venue correction can resolve future reconciliation.`}</p>}
    <form className="security-form" onSubmit={submit} ref={formRef}>
      <label><span>{zh ? "股票代码（不含交易所后缀）" : "Ticker (without exchange suffix)"}</span><input required maxLength={32} value={form.ticker} onChange={(event) => (setValidation(null), setForm({ ...form, ticker: event.target.value }))} /></label>
      <label><span>{zh ? "交易所" : "Exchange"}</span><select value={form.exchangeCode} onChange={(event) => (setValidation(null), setForm({ ...form, exchangeCode: event.target.value }))}>{["NASDAQ", "NYSE", "AMEX", "TSE", "HKEX", "SSE", "SZSE"].map((exchange) => <option key={exchange}>{exchange}</option>)}</select></label>
      <label><span>{zh ? "中文名称" : "Chinese name"}</span><input required maxLength={200} value={form.nameZh} onChange={(event) => setForm({ ...form, nameZh: event.target.value })} /></label>
      <label><span>{zh ? "英文名称" : "English name"}</span><input required maxLength={200} value={form.nameEn} onChange={(event) => setForm({ ...form, nameEn: event.target.value })} /></label>
      <label><span>{zh ? "风格（需业务确认）" : "Style (business approval required)"}</span><select value={form.style} onChange={(event) => setForm({ ...form, style: event.target.value })}><option value="growth">{zh ? "成长" : "Growth"}</option><option value="value">{zh ? "价值" : "Value"}</option></select></label>
      <label><span>{zh ? "资料来源名称（选填）" : "Reference source (optional)"}</span><input maxLength={200} value={form.sourceName} onChange={(event) => setForm({ ...form, sourceName: event.target.value })} /></label>
      <label><span>{zh ? "资料来源网址（选填）" : "Reference URL (optional)"}</span><input type="url" maxLength={1000} value={form.sourceUrl} onChange={(event) => setForm({ ...form, sourceUrl: event.target.value })} placeholder="https://" /></label>
      <label><span>{zh?'每手股数（选填，需核实）':'Shares per trading lot (optional, verify)'}</span><input type="number" min="1" max="1000000" step="1" value={form.tradingLotSize} onChange={event=>setForm({...form,tradingLotSize:event.target.value})}/><small>{zh?'用于提示整手取整差异，不会自动放宽金额偏差标准。6861 的普通交易单位为100股。':'Used for lot-rounding review, not automatic tolerance relaxation. Verify instrument-specific rules.'}</small></label>
      {editing&&<label><span>{zh?'修改原因（必填）':'Reason for correction (required)'}</span><textarea required minLength={5} maxLength={1000} value={reason} onChange={event=>setReason(event.target.value)} placeholder={zh?'例如：录入时选错上市交易所，现已核实更正':'Explain the verified correction'}/></label>}
      <button type="button" className="secondary-button compact" disabled={busy || !form.ticker.trim()} onClick={checkCoverage}>{zh ? "检查代码及价格覆盖" : "Check ticker and price coverage"}</button>
      <button className="primary-button compact" disabled={busy}>{editing?(zh?'核验并保存修改':'Verify and save changes'):(zh ? "核实并收录股票" : "Register verified security")}</button>
      {editing&&<button type="button" className="secondary-button compact" disabled={busy} onClick={()=>{setEditing(null);setForm(emptyForm);setValidation(null);setReason('');}}>{zh?'取消修改':'Cancel editing'}</button>}
    </form>
    {message && <p className="form-message" role="status">{message}</p>}
    {validation && <section className="history-coverage-panel" role="status"><h4>{validation.ticker} · {zh ? "证券与价格核验" : "Security and price verification"}</h4><p>{validation.coverage.provider} · {validation.coverage.observations}{zh ? "个完整周" : " complete weeks"} · {validation.coverage.firstDate ?? "—"} – {validation.coverage.lastDate ?? "—"}</p><strong className={validation.coverage.status === "ready" && validation.exchangeMatches !== false ? "result-pass" : "result-fail"}>{validation.exchangeMatches === false ? (zh ? "上市交易所不匹配，不能收录" : "Listing venue mismatch; registration blocked") : validation.coverage.status === "unavailable" ? (zh ? "取价失败，请核对代码或数据连接" : "No price data; check ticker or connection") : validation.coverage.status === "short_history" ? (zh ? "可以收录，但未满足标准100周；回测阶段需检查并明确确认短历史" : "Registration allowed; fewer than 100 weeks requires explicit short-history review") : (zh ? "当前历史长度满足100周；组合共同周数及风险仍需回测" : "Individual history meets 100 weeks; aligned portfolio history and risk still require backtesting")}</strong><p>{validation.coverage.reason || validation.coverage.fallbackReason}</p>{validation.listingNote && <small>{zh ? "上市交易所尚需管理员确认：" : "Administrator must confirm the listing venue: "}{validation.listingNote}</small>}</section>}
    <p>{zh ? `目前可用${securities.length}只股票。` : `${securities.length} securities available.`}</p>
    <div className="table-wrap"><table><thead><tr><th>Ticker</th><th>{zh ? "名称" : "Name"}</th><th>{zh ? "交易所" : "Exchange"}</th><th>{zh ? "风格" : "Style"}</th><th>{zh ? "收录时价格覆盖" : "Coverage at registration"}</th><th>{zh?"每手股数":"Trading lot"}</th><th>{zh?"操作":"Action"}</th></tr></thead><tbody>{securities.map((security) => <tr key={security.id}><td>{security.ticker}</td><td>{/^https?:\/\//.test(security.source_url) ? <a href={security.source_url} target="_blank" rel="noreferrer">{zh ? security.name_zh : security.name_en}</a> : (zh ? security.name_zh : security.name_en)}</td><td>{security.exchange_code}</td><td>{security.style === "growth" ? (zh ? "成长" : "Growth") : (zh ? "价值" : "Value")}</td><td>{security.data_coverage ? `${security.data_coverage.provider} · ${security.data_coverage.observations} ${zh ? "周" : "weeks"} · ${security.data_coverage.status}` : (zh ? "未检查（可在上方核验）" : "Not checked; use the form above")}</td><td>{security.trading_lot_size??"—"}</td><td><button className="secondary-button compact" disabled={busy} onClick={()=>edit(security)} aria-label={`${zh?"修改":"Edit"} ${security.ticker} ${security.exchange_code}`}>{zh?"修改":"Edit"}</button></td></tr>)}</tbody></table></div>
  </section>;
}
