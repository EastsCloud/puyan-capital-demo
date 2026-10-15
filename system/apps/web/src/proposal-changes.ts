import type {Holding} from './proposed-portfolio-model';
export function compareDraftHoldings(saved:Holding[],draft:Holding[]) {
  const before=new Map(saved.map(h=>[h.tickerUniverseId,h.weight]));
  const after=new Map(draft.map(h=>[h.tickerUniverseId,h.weight]));
  const added=draft.filter(h=>!before.has(h.tickerUniverseId)).map(h=>h.tickerUniverseId);
  const removed=saved.filter(h=>!after.has(h.tickerUniverseId)).map(h=>h.tickerUniverseId);
  const modified=draft.filter(h=>before.has(h.tickerUniverseId)&&(!Number.isFinite(h.weight)||Math.abs(h.weight-before.get(h.tickerUniverseId)!)>0.000000005)).map(h=>h.tickerUniverseId);
  return {added,removed,modified,changed:added.length+removed.length+modified.length>0};
}
