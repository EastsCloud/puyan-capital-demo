export function normalizeSecurityIdentity(ticker: string, exchangeCode: string) {
  const market = exchangeCode === 'TSE' ? 'JP' : exchangeCode === 'HKEX' ? 'HK' : ['SSE', 'SZSE'].includes(exchangeCode) ? 'CN_A' : 'US';
  const sleeve = market === 'US' ? 'us' : market === 'JP' ? 'developedNonUs' : 'emerging';
  const raw = ticker.trim().toUpperCase();
  if (market === 'HK' && (!/^\d{1,5}$/.test(raw))) throw new Error('Hong Kong ticker must contain 1–5 digits without suffix');
  if (market === 'CN_A' && !/^\d{1,6}$/.test(raw)) throw new Error('China A ticker must contain 1–6 digits without suffix');
  if (market === 'JP' && !/^[0-9A-Z]{4}$/.test(raw)) throw new Error('Tokyo ticker must contain four letters/digits without suffix');
  if (market === 'US' && /\.(US|NASDAQ|NYSE|AMEX)$/.test(raw)) throw new Error('Enter the ticker without an exchange suffix');
  return { ticker: market === 'HK' ? raw.padStart(4, '0') : market === 'CN_A' ? raw.padStart(6, '0') : raw, market, sleeve };
}
export function listingExchangeMatches(expected: string, actual: string): boolean | null {
  const aliases: Record<string, string[]> = { NASDAQ:['NMS','NGM','NCM','NASDAQ'], NYSE:['NYQ','NYSE'], AMEX:['ASE','AMEX','NYAMERICAN'], TSE:['JPX','TYO','TSE'], HKEX:['HKG','HKEX'], SSE:['SHH','SSE'], SZSE:['SHZ','SZSE'] };
  if (!Object.values(aliases).some(values => values.includes(actual.toUpperCase()))) return null;
  return aliases[expected]?.includes(actual.toUpperCase()) ?? null;
}
