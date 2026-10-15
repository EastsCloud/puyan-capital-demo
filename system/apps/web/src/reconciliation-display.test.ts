import {describe,it,expect} from 'vitest';
import {reconciliationExplanation} from './reconciliation-display';
describe('explain execution differences',()=>{
  it('shows the actual percent limit and lot-review warning without claiming automatic matching',()=>{
    const text=reconciliationExplanation({status:'exception',varianceRate:-25900/225000,detail:{lotRoundingCandidate:true,lotSize:100,roundedQuantity:500,toleranceValue:4500}},2,true);
    expect(text).toContain('-11.51%');expect(text).toContain('±2%');expect(text).toContain('不自动消除异常');expect(text).toContain('允许差额：4,500');
  });
  it('shows identity correction and missing-plan explanations',()=>{expect(reconciliationExplanation({status:'unplanned'},2,true)).toContain('没有对应');expect(reconciliationExplanation({status:'matched',varianceRate:0,detail:{identityCorrections:[{}]}},2,false)).toContain('audited venue correction');});
});
