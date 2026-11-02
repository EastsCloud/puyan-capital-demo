export const supportedMarkets=['US','HK','SHG','SHE','TSE'] as const;
export type SyncMarket=typeof supportedMarkets[number];
export function previousBusinessDate(now=new Date()) {const date=new Date(now);do{date.setUTCDate(date.getUTCDate()-1);}while([0,6].includes(date.getUTCDay()));return date.toISOString().slice(0,10);}
export function normalizedTicker(value:unknown,market:SyncMarket) {
 const ticker=String(value??'').trim().toUpperCase();
 if(!/^[A-Z0-9][A-Z0-9.-]{0,31}$/.test(ticker))return null;
 return market==='HK'&&/^\d+$/.test(ticker)?ticker.padStart(4,'0'):market==='SHG'||market==='SHE'?ticker.padStart(6,'0'):ticker;
}
export async function fetchMarketRows(token:string,market:SyncMarket,operation:'directory'|'prices',date:string,signal?:AbortSignal,fetcher:typeof fetch=fetch) {
 const url=new URL(`https://eodhd.com/api/${operation==='directory'?'exchange-symbol-list':'eod-bulk-last-day'}/${market}`);
 url.searchParams.set('fmt','json');if(operation==='prices')url.searchParams.set('date',date);
 const sourceUrl=url.toString();url.searchParams.set('api_token',token);
 const response=await fetcher(url,{signal:signal?AbortSignal.any([signal,AbortSignal.timeout(25000)]):AbortSignal.timeout(25000)});
 if(!response.ok)throw new Error(`EODHD ${market}: HTTP ${response.status}${response.status===403?' (subscription coverage required)':''}`);
 const rows:unknown=await response.json();if(!Array.isArray(rows))throw new Error(`EODHD ${market}: invalid bulk response`);
 if(!rows.length)throw new Error(`EODHD ${market}: empty result; check holiday, entitlement and publication time`);
 return {rows:rows as Record<string,unknown>[],sourceUrl};
}
export function directoryRows(rows:Record<string,unknown>[],market:SyncMarket) {
 return rows.flatMap(row=>{const ticker=normalizedTicker(row.Code,market);if(!ticker||typeof row.Name!=='string'||!row.Name.trim())return [];
 return [{ticker,name:row.Name.slice(0,200),currency:String(row.Currency??'').slice(0,3),instrumentType:String(row.Type??''),listingExchange:String(row.Exchange??''),isin:String(row.Isin??'')}];});
}
export function priceRows(rows:Record<string,unknown>[],market:SyncMarket,date:string) {
 return rows.flatMap(row=>{const ticker=normalizedTicker(row.code,market);const close=Number(row.close),adjustedClose=Number(row.adjusted_close);
 if(!ticker||row.date!==date||!Number.isFinite(close)||close<=0)return [];
 return [{ticker,date,close,adjustedClose:row.adjusted_close!=null&&Number.isFinite(adjustedClose)&&adjustedClose>0?adjustedClose:null}];});
}
