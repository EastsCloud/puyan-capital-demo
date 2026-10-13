import { describe, expect, it } from 'vitest';
import { apiErrorMessage } from './api-error';
describe('API error detail',()=>{
  it('shows Fastify message instead of the generic HTTP label',()=>{
    expect(apiErrorMessage({error:'Conflict',message:'CRCL: fewer than 100 weekly observations'})).toContain('CRCL');
  });
  it('preserves validation paths and safely handles missing response bodies',()=>{
    expect(apiErrorMessage({error:'invalid_request',issues:[{path:['ticker'],message:'Invalid'}]})).toBe('ticker: Invalid');
    expect(apiErrorMessage({},'HTTP 502')).toBe('HTTP 502');
  });
});
