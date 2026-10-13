export interface HistoryReport {
  ready: boolean; minimumWeeklyObservations: number; checkedAt: string; proposedPortfolioVersion?: number;
  coverage: Array<{ symbol: string; provider: string; observations: number; firstDate: string | null; lastDate: string | null; status: string; reason: string | null; fallbackReason: string | null }>;
  sleeves: Array<{ sleeve: string; commonWeeks: number }>;
  issues: Array<{ symbol: string; code: string; message: string }>;
}
export function HistoryCoveragePanel({ report, zh }: { report: HistoryReport; zh: boolean }) {
  const labels: Record<string, string> = { us: zh ? '美股' : 'US', developedNonUs: zh ? '日本' : 'Japan', emerging: zh ? '新兴市场' : 'Emerging' };
  return <section className="history-coverage-panel" aria-label={zh ? '历史价格覆盖检查' : 'Historical price coverage'}>
    <h4>{zh ? '历史价格覆盖检查' : 'Historical price coverage'}{report.proposedPortfolioVersion ? ` · v${report.proposedPortfolioVersion}` : ''}</h4>
    <p>{zh ? `至少需要${report.minimumWeeklyObservations}个完整周；当前未结束周不计入。使用交易所当地日线归并周线，不补造历史数据。` : `At least ${report.minimumWeeklyObservations} completed weeks required. The current partial week is excluded. Weekly closes use exchange-local daily dates; missing history is never fabricated.`}</p>
    <strong className={report.ready ? 'result-pass' : 'result-fail'}>{report.ready ? (zh ? '数据覆盖检查通过（不代表风险控制通过）' : 'Data coverage ready; risk controls still require backtesting') : (zh ? '数据未就绪，不能完成回测' : 'Data not ready for backtesting')}</strong>
    {report.issues.length > 0 && <ul className="proposal-errors" role="alert">{report.issues.map((issue, index) => <li key={index}>{issue.message}</li>)}</ul>}
    <div className="proposal-counts">{report.sleeves.map(item => <span key={item.sleeve}>{labels[item.sleeve] ?? item.sleeve}：{item.commonWeeks}{zh ? '个共同周' : ' aligned weeks'}</span>)}</div>
    <div className="table-wrap"><table><thead><tr><th>{zh ? '证券 / 基准' : 'Security / benchmark'}</th><th>{zh ? '实际来源' : 'Actual provider'}</th><th>{zh ? '完整周数' : 'Completed weeks'}</th><th>{zh ? '数据日期' : 'Date coverage'}</th><th>{zh ? '结果 / 后备原因' : 'Result / fallback reason'}</th></tr></thead><tbody>{report.coverage.map(item => <tr key={item.symbol}><td>{item.symbol}</td><td>{item.provider}</td><td>{item.observations}</td><td>{item.firstDate ?? '—'} – {item.lastDate ?? '—'}</td><td><strong className={item.status === 'ready' ? 'result-pass' : 'result-fail'}>{item.status === 'ready' ? (zh ? '长度足够' : 'Ready') : item.status === 'short_history' ? (zh ? '历史不足' : 'Short history') : (zh ? '取价失败' : 'Unavailable')}</strong>{(item.reason || item.fallbackReason) && <small>{item.reason || item.fallbackReason}</small>}</td></tr>)}</tbody></table></div>
    <small>{zh ? '检查时间：' : 'Checked: '}{report.checkedAt}</small>
  </section>;
}
