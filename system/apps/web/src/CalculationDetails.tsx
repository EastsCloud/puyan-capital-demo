export interface ReturnBetaEvidence {
  observationCount:number;portfolioMean:number;benchmarkMean:number;covarianceSum:number;varianceSum:number;
  sampleCovariance:number;sampleBenchmarkVariance:number;beta:number;wealth:number;cumulativeReturn:number;
  annualizedReturn:number;annualizationExponent:number;elapsedWeeks:number;calendarAnnualizedReturn:number;hasCalendarGaps:boolean;
  inputs:Array<{kind:string;symbol:string;weight:number;provider:string;sourceUrl:string;prices:Array<{week:string;date:string;value:number}>}>;
  intervals:Array<{from:string;to:string;elapsedWeeks:number;portfolioReturn:number;benchmarkReturn:number;covarianceTerm:number;varianceTerm:number}>;
}
export interface TargetEvidence {
  targetReturnRate:number;
  decomposition:{baselineReturn:number;expectedBuffer:number;shortfallAllocatedToEquity:number;sleeves?:Array<{key:string;weight:number;referenceReturn:number;baselineContribution:number;targetContribution:number;targetReturn:number}>};
  equityTargets:Array<{key:string;targetReturn:number;targetBeta:number;riskFreeRate:number;rawDecomposedTargetReturn?:number;marketReferenceReturn?:number;
    capm?:{effectiveTargetReturn:number;effectiveMarketReturn:number;adjustedForNonPositiveExcessReturn:boolean;adjustedForLowMarketRiskPremium:boolean};
    calculation?:{benchmark:string;policy:{minimumPositiveExcessReturn:number;minimumPositiveMarketRiskPremium:number};marketWeights:Record<string,number>}}>;
}
const number=(n:number)=>Number.isFinite(n)?n.toPrecision(12):'—';
const pct=(n:number)=>`${(n*100).toFixed(6)}%`;
const label=(key:string,zh:boolean)=>({us:zh?'美股':'US',developedNonUs:zh?'日本':'Japan',emerging:zh?'新兴市场（A股+港股）':'Emerging (China A + HK)'})[key]??key;
export function downloadCalculation(name:string, rows:unknown[][]) {
  const csv='\uFEFF'+rows.map(row=>row.map(value=>'"'+String(value??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function TargetCalculationDetails({context,zh}:{context:TargetEvidence;zh:boolean}) {
  return <details className="source-details"><summary>{zh?'展开收益率目标与目标Beta计算过程':'Show target return and target beta calculations'}</summary>
    <p>{zh?'这里是目标Beta（CAPM反推），回测实际Beta另用收益协方差÷基准方差计算。年度市场参考收益使用情景样本的月收益算术平均×12，不等同于历史复利收益。':'This is target beta inferred from CAPM. Actual backtest beta uses covariance/variance. Annual market references use scenario monthly arithmetic mean ×12, not historical compounded returns.'}</p>
    <p>{zh?'组合基准收益 Σ(资产权重×参考收益)':'Baseline Σ(weight × reference return)'} = {pct(context.decomposition.baselineReturn)}；{zh?'批准收益下限':'Approved floor'} = {pct(context.targetReturnRate)}；{zh?'股票补足额 max(0,下限−基准)':'Equity shortfall max(0, floor − baseline)'} = {pct(context.decomposition.shortfallAllocatedToEquity)}。</p>
    <div className="table-wrap"><table><thead><tr>{(zh?['资产','组合权重','参考收益','基准贡献','目标贡献','分解目标收益']:['Asset','Weight','Reference','Baseline contribution','Target contribution','Decomposed target']).map(item=><th key={item}>{item}</th>)}</tr></thead><tbody>{context.decomposition.sleeves?.map(item=><tr key={item.key}><td>{label(item.key,zh)}</td><td>{pct(item.weight)}</td><td>{pct(item.referenceReturn)}</td><td>{pct(item.baselineContribution)}</td><td>{pct(item.targetContribution)}</td><td>{pct(item.targetReturn)}</td></tr>)}</tbody></table></div>
    <p>{zh?'股票分解目标＝本市场参考收益＋股票补足额÷股票总权重；目标Beta＝(有效目标收益−无风险利率)÷(有效市场收益−无风险利率)。':'Equity target = market reference + shortfall / total equity weight. Target beta = (effective target − risk-free rate) / (effective market return − risk-free rate).'}</p>
    {context.equityTargets.map(item=><section key={item.key}><h4>{label(item.key,zh)} · {item.calculation?.benchmark}</h4>
      <p>{zh?'原始分解目标 / 原始市场参考 / 无风险利率':'Raw target / raw market reference / risk-free'}：{pct(item.rawDecomposedTargetReturn??item.targetReturn)} / {item.marketReferenceReturn===undefined?'—':pct(item.marketReferenceReturn)} / {pct(item.riskFreeRate)}</p>
      {item.capm?<><p>β = ({number(item.capm.effectiveTargetReturn)} − {number(item.riskFreeRate)}) ÷ ({number(item.capm.effectiveMarketReturn)} − {number(item.riskFreeRate)}) = <strong>{number(item.targetBeta)}</strong></p>
        <p>{zh?'目标收益调整 / 市场溢价调整':'Target adjustment / market premium adjustment'}：{item.capm.adjustedForNonPositiveExcessReturn?(zh?'已触发':'Applied'):(zh?'未触发':'Not applied')} / {item.capm.adjustedForLowMarketRiskPremium?(zh?'已触发':'Applied'):(zh?'未触发':'Not applied')}。{zh?'当目标超额收益≤0时调整；当市场风险溢价低于阈值时调整。这是额外业务规则。':'Nonpositive target excess return and low market premium trigger additional business-policy adjustments.'}</p>
        {item.calculation?<p>{zh?'最低目标超额收益 / 最低市场风险溢价':'Minimum target excess / market premium'}：{pct(item.calculation.policy.minimumPositiveExcessReturn)} / {pct(item.calculation.policy.minimumPositiveMarketRiskPremium)}。{item.key==='emerging'&&`${zh?'市场参考与无风险利率按A股/港股权重加权；权重':'Reference and risk-free rates mix China A/HK; weights'}: ${JSON.stringify(item.calculation.marketWeights)}`}</p>:<p>{zh?'历史记录未保存阈值快照，不能用当前参数冒充原始依据。':'Legacy result has no threshold snapshot; current settings are not historical evidence.'}</p>}
      </>:<p>{zh?'历史结果没有保存完整CAPM明细，需要新建试算复核；原结果保留。':'Legacy CAPM details unavailable. Run a separate calculation to verify; the original is retained.'}</p>}
    </section>)}
    <button type="button" className="secondary-button compact" onClick={()=>downloadCalculation('target-return-beta.csv',[
      ['sleeve','raw_target','raw_market','risk_free','effective_target','effective_market','target_beta','target_adjusted','market_adjusted'],
      ...context.equityTargets.map(item=>[item.key,item.rawDecomposedTargetReturn,item.marketReferenceReturn,item.riskFreeRate,item.capm?.effectiveTargetReturn,item.capm?.effectiveMarketReturn,item.targetBeta,item.capm?.adjustedForNonPositiveExcessReturn,item.capm?.adjustedForLowMarketRiskPremium])])}>{zh?'导出目标计算CSV':'Export target calculation CSV'}</button>
  </details>;
}
export function BacktestCalculationDetails({evidence,zh,sleeve}:{evidence?:ReturnBetaEvidence;zh:boolean;sleeve:string}) {
  if(!evidence)return <p className="readonly-note">{label(sleeve,zh)}：{zh?'历史回测未保存逐期计算明细，无法据当前行情重建原结果。可另行回测复核，原记录保留。':'This legacy run has no frozen calculation evidence. Recheck with a new run; current prices cannot reconstruct the original.'}</p>;
  return <details className="source-details"><summary>{label(sleeve,zh)} · {zh?'实际收益率 / 实际Beta计算明细':'Actual return / beta calculation'}</summary>
    <p>{zh?'每期组合收益 Σ(固定权重×个股简单收益)，每个观测区间恢复该权重；并非买入后权重自然漂移。基准也按所列权重加权。':'Interval return = Σ(fixed weight × simple security return), rebalanced each observation interval. Benchmark returns use the listed weights.'}</p>
    <p>n = {evidence.observationCount}；{zh?'组合收益均值 / 基准收益均值':'Portfolio / benchmark mean'} = {number(evidence.portfolioMean)} / {number(evidence.benchmarkMean)}</p>
    <p>Σ[(Rp−mean(Rp))×(Rm−mean(Rm))] = {number(evidence.covarianceSum)}；Σ[(Rm−mean(Rm))²] = {number(evidence.varianceSum)}</p>
    <p>{zh?'样本协方差 / 样本基准方差':'Sample covariance / benchmark variance'} = {number(evidence.sampleCovariance)} / {number(evidence.sampleBenchmarkVariance)}；β = <strong>{number(evidence.beta)}</strong></p>
    <p>Π(1+Rp) = {number(evidence.wealth)}；{zh?'累计收益':'Cumulative return'} = {pct(evidence.cumulativeReturn)}；{zh?'模型年化收益':'Model annual return'} = {number(evidence.wealth)} ^ (52 / {evidence.observationCount}) − 1 = <strong>{pct(evidence.annualizedReturn)}</strong></p>
    {evidence.hasCalendarGaps&&<p className="pending-note">{zh?`存在休市或缺周：模型按${evidence.observationCount}个观测区间年化，实际跨${evidence.elapsedWeeks}个日历周；按日历年化为${pct(evidence.calendarAnnualizedReturn)}，仅供比较，不替换已存模型结果。`:`Calendar gaps: ${evidence.observationCount} intervals span ${evidence.elapsedWeeks} weeks. Calendar annual return ${pct(evidence.calendarAnnualizedReturn)} is shown for comparison; the stored model result is preserved.`}</p>}
    <p>{evidence.inputs.map(item=>`${item.kind}: ${item.symbol} × ${pct(item.weight)} (${item.provider})`).join('；')}</p>
    <button type="button" className="secondary-button compact" onClick={()=>downloadCalculation(`${sleeve}-return-beta.csv`,[
      ['from','to','elapsed_weeks','portfolio_return','benchmark_return','covariance_term','variance_term'],
      ...evidence.intervals.map(item=>[item.from,item.to,item.elapsedWeeks,item.portfolioReturn,item.benchmarkReturn,item.covarianceTerm,item.varianceTerm])])}>{zh?'导出逐期收益CSV':'Export interval returns CSV'}</button>{' '}
    <button type="button" className="secondary-button compact" onClick={()=>downloadCalculation(`${sleeve}-frozen-prices.csv`,[
      ['kind','symbol','weight','provider','source_url','week','actual_date','adjusted_price'],
      ...evidence.inputs.flatMap(input=>input.prices.map(point=>[input.kind,input.symbol,input.weight,input.provider,input.sourceUrl,point.week,point.date,point.value]))])}>{zh?'导出本次冻结价格CSV':'Export frozen prices CSV'}</button>
    <div className="table-wrap"><table><thead><tr>{['From','To','Weeks','Rp','Rm','Covariance term','Variance term'].map(item=><th key={item}>{item}</th>)}</tr></thead><tbody>{evidence.intervals.map(item=><tr key={item.to}><td>{item.from}</td><td>{item.to}</td><td>{item.elapsedWeeks}</td><td>{number(item.portfolioReturn)}</td><td>{number(item.benchmarkReturn)}</td><td>{number(item.covarianceTerm)}</td><td>{number(item.varianceTerm)}</td></tr>)}</tbody></table></div>
  </details>;
}
