import {describe,it,expect} from 'vitest';
import {compareDraftHoldings} from './proposal-changes';
describe('explicit draft modification state',()=>{
  const saved=[{tickerUniverseId:'a',weight:.4},{tickerUniverseId:'b',weight:.6}];
  it('does not mark opening or reordering a draft as modification',()=>{expect(compareDraftHoldings(saved,[...saved].reverse()).changed).toBe(false);});
  it('marks and counts additions, removals and reweighting',()=>{expect(compareDraftHoldings(saved,[{tickerUniverseId:'a',weight:.5},{tickerUniverseId:'c',weight:.5}])).toEqual({changed:true,added:['c'],removed:['b'],modified:['a']});});
  it('clears modification after restoring the original weights and respects storage precision',()=>{expect(compareDraftHoldings(saved,saved.map(h=>({...h,weight:h.weight+1e-10}))).changed).toBe(false);expect(compareDraftHoldings(saved,[{...saved[0],weight:NaN},saved[1]]).changed).toBe(true);});
});
