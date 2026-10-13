import { useEffect, useState, type FormEvent } from "react";
import type { Security } from "./proposed-portfolio-model";

interface SecurityValidation {
  ticker: string; exchangeMatches: boolean | null; listingExchange: string; listingNote: string | null;
  coverage: { provider: string; observations: number; status: string; firstDate: string | null; lastDate: string | null; reason: string | null; fallbackReason: string | null };
}
export function SecuritiesPage({ zh, request }: { zh: boolean; request: <T>(path: string, init?: RequestInit) => Promise<T> }) {
  const [securities, setSecurities] = useState<Security[]>([]);
  const [validation, setValidation] = useState<SecurityValidation | null>(null);
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState({ ticker: "", exchangeCode: "NASDAQ", nameEn: "", nameZh: "", style: "growth", sourceName: "", sourceUrl: "" });
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
      const result = await request<{ validation: SecurityValidation }>("/api/admin/securities", { method: "POST", body: JSON.stringify(form) });
      setValidation(result.validation);
      await load(); setForm({ ...form, ticker: "", nameEn: "", nameZh: "" });
      setMessage(zh ? "股票已收录。执行小组可在导入预览中刷新股票库并选择；不会自动加入任何投资组合。" : "Security registered. The execution team can refresh the import preview and select it. No portfolio was changed.");
    } catch (error) {
      const details = (error as Error & { body?: { validation?: SecurityValidation } }).body?.validation;
      if (details) setValidation(details);
      setMessage((error as Error).message);
    } finally { setBusy(false); }
  }
  return <section className="annual-data-panel securities-panel"><header><div><span className="section-label">{zh ? "管理员维护" : "Administrator maintenance"}</span><h3>{zh ? "股票库" : "Securities"}</h3><p>{zh ? "补充未收录股票，请核实代码、交易所和风格。新增资料仅供本团队使用，不修改历史持仓；收录前核验真实价格与上市交易所。历史不足100周可收录但不能通过当前回测数据门槛。资料网址可留空，将自动提供参考链接。" : "Verify ticker, exchange and style before registration. New entries belong to your organization, preserve historical holdings and are checked against live prices and listing venues. Short-history names may be registered but cannot pass the current 100-week backtest gate. Reference fields are optional."}</p></div></header>
    <form className="security-form" onSubmit={submit}>
      <label><span>{zh ? "股票代码（不含交易所后缀）" : "Ticker (without exchange suffix)"}</span><input required maxLength={32} value={form.ticker} onChange={(event) => (setValidation(null), setForm({ ...form, ticker: event.target.value }))} /></label>
      <label><span>{zh ? "交易所" : "Exchange"}</span><select value={form.exchangeCode} onChange={(event) => (setValidation(null), setForm({ ...form, exchangeCode: event.target.value }))}>{["NASDAQ", "NYSE", "AMEX", "TSE", "HKEX", "SSE", "SZSE"].map((exchange) => <option key={exchange}>{exchange}</option>)}</select></label>
      <label><span>{zh ? "中文名称" : "Chinese name"}</span><input required maxLength={200} value={form.nameZh} onChange={(event) => setForm({ ...form, nameZh: event.target.value })} /></label>
      <label><span>{zh ? "英文名称" : "English name"}</span><input required maxLength={200} value={form.nameEn} onChange={(event) => setForm({ ...form, nameEn: event.target.value })} /></label>
      <label><span>{zh ? "风格（需业务确认）" : "Style (business approval required)"}</span><select value={form.style} onChange={(event) => setForm({ ...form, style: event.target.value })}><option value="growth">{zh ? "成长" : "Growth"}</option><option value="value">{zh ? "价值" : "Value"}</option></select></label>
      <label><span>{zh ? "资料来源名称（选填）" : "Reference source (optional)"}</span><input maxLength={200} value={form.sourceName} onChange={(event) => setForm({ ...form, sourceName: event.target.value })} /></label>
      <label><span>{zh ? "资料来源网址（选填）" : "Reference URL (optional)"}</span><input type="url" maxLength={1000} value={form.sourceUrl} onChange={(event) => setForm({ ...form, sourceUrl: event.target.value })} placeholder="https://" /></label>
      <button type="button" className="secondary-button compact" disabled={busy || !form.ticker.trim()} onClick={checkCoverage}>{zh ? "检查代码及价格覆盖" : "Check ticker and price coverage"}</button>
      <button className="primary-button compact" disabled={busy}>{zh ? "核实并收录股票" : "Register verified security"}</button>
    </form>
    {message && <p className="form-message" role="status">{message}</p>}
    {validation && <section className="history-coverage-panel" role="status"><h4>{validation.ticker} · {zh ? "证券与价格核验" : "Security and price verification"}</h4><p>{validation.coverage.provider} · {validation.coverage.observations}{zh ? "个完整周" : " complete weeks"} · {validation.coverage.firstDate ?? "—"} – {validation.coverage.lastDate ?? "—"}</p><strong className={validation.coverage.status === "ready" && validation.exchangeMatches !== false ? "result-pass" : "result-fail"}>{validation.exchangeMatches === false ? (zh ? "上市交易所不匹配，不能收录" : "Listing venue mismatch; registration blocked") : validation.coverage.status === "unavailable" ? (zh ? "取价失败，请核对代码或数据连接" : "No price data; check ticker or connection") : validation.coverage.status === "short_history" ? (zh ? "可以收录，但历史不足100周，当前不能完成回测" : "Registration allowed; fewer than 100 weeks blocks backtesting") : (zh ? "当前历史长度满足100周；组合共同周数及风险仍需回测" : "Individual history meets 100 weeks; aligned portfolio history and risk still require backtesting")}</strong><p>{validation.coverage.reason || validation.coverage.fallbackReason}</p>{validation.listingNote && <small>{zh ? "上市交易所尚需管理员确认：" : "Administrator must confirm the listing venue: "}{validation.listingNote}</small>}</section>}
    <p>{zh ? `目前可用${securities.length}只股票。` : `${securities.length} securities available.`}</p>
    <div className="table-wrap"><table><thead><tr><th>Ticker</th><th>{zh ? "名称" : "Name"}</th><th>{zh ? "交易所" : "Exchange"}</th><th>{zh ? "风格" : "Style"}</th><th>{zh ? "收录时价格覆盖" : "Coverage at registration"}</th></tr></thead><tbody>{securities.map((security) => <tr key={security.id}><td>{security.ticker}</td><td>{/^https?:\/\//.test(security.source_url) ? <a href={security.source_url} target="_blank" rel="noreferrer">{zh ? security.name_zh : security.name_en}</a> : (zh ? security.name_zh : security.name_en)}</td><td>{security.exchange_code}</td><td>{security.style === "growth" ? (zh ? "成长" : "Growth") : (zh ? "价值" : "Value")}</td><td>{security.data_coverage ? `${security.data_coverage.provider} · ${security.data_coverage.observations} ${zh ? "周" : "weeks"} · ${security.data_coverage.status}` : (zh ? "未检查（可在上方核验）" : "Not checked; use the form above")}</td></tr>)}</tbody></table></div>
  </section>;
}
