import { useEffect, useState, type FormEvent } from "react";
import type { Security } from "./proposed-portfolio-model";

export function SecuritiesPage({ zh, request }: { zh: boolean; request: <T>(path: string, init?: RequestInit) => Promise<T> }) {
  const [securities, setSecurities] = useState<Security[]>([]);
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState({ ticker: "", exchangeCode: "NASDAQ", nameEn: "", nameZh: "", style: "growth", sourceName: "", sourceUrl: "" });
  const load = async () => setSecurities((await request<{ securities: Security[] }>("/api/securities")).securities);
  useEffect(() => { void load().catch((error: Error) => setMessage(error.message)); }, []);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage(null);
    try {
      await request("/api/admin/securities", { method: "POST", body: JSON.stringify(form) });
      await load(); setForm({ ...form, ticker: "", nameEn: "", nameZh: "" });
      setMessage(zh ? "股票已收录。执行小组可在导入预览中刷新股票库并选择；不会自动加入任何投资组合。" : "Security registered. The execution team can refresh the import preview and select it. No portfolio was changed.");
    } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }
  return <section className="annual-data-panel securities-panel"><header><div><span className="section-label">{zh ? "管理员维护" : "Administrator maintenance"}</span><h3>{zh ? "股票库" : "Securities"}</h3><p>{zh ? "补充未收录股票，请核实代码、交易所和风格。新增资料仅供本团队使用，不修改历史持仓；价格是否可获取仍由取数及回测核验。" : "Verify ticker, exchange and style before registration. New entries belong to your organization, preserve historical holdings and remain subject to price-data and backtest checks."}</p></div></header>
    <form className="security-form" onSubmit={submit}>
      <label><span>{zh ? "股票代码（不含交易所后缀）" : "Ticker (without exchange suffix)"}</span><input required maxLength={32} value={form.ticker} onChange={(event) => setForm({ ...form, ticker: event.target.value })} /></label>
      <label><span>{zh ? "交易所" : "Exchange"}</span><select value={form.exchangeCode} onChange={(event) => setForm({ ...form, exchangeCode: event.target.value })}>{["NASDAQ", "NYSE", "AMEX", "TSE", "HKEX", "SSE", "SZSE"].map((exchange) => <option key={exchange}>{exchange}</option>)}</select></label>
      <label><span>{zh ? "中文名称" : "Chinese name"}</span><input required maxLength={200} value={form.nameZh} onChange={(event) => setForm({ ...form, nameZh: event.target.value })} /></label>
      <label><span>{zh ? "英文名称" : "English name"}</span><input required maxLength={200} value={form.nameEn} onChange={(event) => setForm({ ...form, nameEn: event.target.value })} /></label>
      <label><span>{zh ? "风格（需业务确认）" : "Style (business approval required)"}</span><select value={form.style} onChange={(event) => setForm({ ...form, style: event.target.value })}><option value="growth">{zh ? "成长" : "Growth"}</option><option value="value">{zh ? "价值" : "Value"}</option></select></label>
      <label><span>{zh ? "资料来源名称" : "Reference source"}</span><input required maxLength={200} value={form.sourceName} onChange={(event) => setForm({ ...form, sourceName: event.target.value })} /></label>
      <label><span>{zh ? "资料来源网址" : "Reference URL"}</span><input required type="url" maxLength={1000} value={form.sourceUrl} onChange={(event) => setForm({ ...form, sourceUrl: event.target.value })} placeholder="https://" /></label>
      <button className="primary-button compact" disabled={busy}>{zh ? "核实并收录股票" : "Register verified security"}</button>
    </form>
    {message && <p className="form-message" role="status">{message}</p>}
    <p>{zh ? `目前可用${securities.length}只股票。` : `${securities.length} securities available.`}</p>
    <div className="table-wrap"><table><thead><tr><th>Ticker</th><th>{zh ? "名称" : "Name"}</th><th>{zh ? "交易所" : "Exchange"}</th><th>{zh ? "风格" : "Style"}</th></tr></thead><tbody>{securities.map((security) => <tr key={security.id}><td>{security.ticker}</td><td>{zh ? security.name_zh : security.name_en}</td><td>{security.exchange_code}</td><td>{security.style === "growth" ? (zh ? "成长" : "Growth") : (zh ? "价值" : "Value")}</td></tr>)}</tbody></table></div>
  </section>;
}
