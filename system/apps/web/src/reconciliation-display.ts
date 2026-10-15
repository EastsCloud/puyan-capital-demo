export interface FillDetail {reason?:string;valueTolerancePct?:number;toleranceValue?:number;lotSize?:number|null;lotValue?:number|null;roundedQuantity?:number|null;lotRoundingCandidate?:boolean;identityCorrections?:unknown[]}
export function reconciliationExplanation(line:{status:string;varianceRate?:string|number|null;detail?:FillDetail|null},tolerance:number,zh:boolean){
  const detail=line.detail;const percent=line.varianceRate===undefined||line.varianceRate===null?null:Number(line.varianceRate)*100;
  const band=detail?.valueTolerancePct??tolerance;const rate=percent===null?'—':`${percent>=0?'+':''}${percent.toFixed(2)}%`;
  let text=line.status==='unplanned'?(zh?'没有对应的已批准交易计划，请核对代码和交易所。':'No matching approved order; verify ticker and exchange.')
    :detail?.reason==='missing_fill'?(zh?'计划交易没有对应成交。':'No fill for this planned order.')
    :detail?.reason==='invalid_plan_value'?(zh?'计划金额无效，不能按比例核对。':'Invalid planned amount; percentage reconciliation unavailable.')
    :line.status==='matched'?(zh?`偏差 ${rate}，在允许范围 ±${band}% 内。`:`Variance ${rate}; within ±${band}%.`)
    :(zh?`偏差 ${rate}，超出允许范围 ±${band}%，需复核；不是固定金额门槛。`:`Variance ${rate}; outside ±${band}%, requiring review. There is no fixed-dollar threshold.`);
  if(detail?.toleranceValue!==undefined&&Number.isFinite(detail.toleranceValue)){const amount=Number(detail.toleranceValue).toLocaleString('en-US',{maximumFractionDigits:2});text+=zh?` 允许差额：${amount}（本位币）。`:` Allowed difference: ${amount} (base currency).`;}
  if(detail?.lotRoundingCandidate)text+=zh?` 可能为整手取整：${detail.lotSize}股/手，按输入成交价估算可购${detail.roundedQuantity}股。此提示不自动消除异常，复核人须核实币种、价格与交易单位并说明。`:` Possible lot rounding: ${detail.lotSize} shares/lot; ${detail.roundedQuantity} shares at the entered price. This does not clear the exception; independently verify currency, price and lot size.`;
  if(detail?.identityCorrections?.length)text+=zh?' 已应用管理员留痕的交易所更正，原计划记录保留。':' An audited venue correction was applied; the original plan is preserved.';
  return text;
}
