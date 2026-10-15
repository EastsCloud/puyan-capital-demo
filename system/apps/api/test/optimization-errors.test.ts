import {describe,it,expect} from 'vitest';
import {optimizationFailure,redactDiagnostic} from '../src/optimization-errors.js';
describe('durable safe optimization diagnostics',()=>{
  it('redacts provider tokens, credentials and connection strings',()=>{
    process.env.TEST_PROVIDER_TOKEN='test-sensitive-token';
    try{const text=redactDiagnostic(new Error('Request test-sensitive-token api_token=token-value postgresql://user:password@server/db'));expect(text).not.toContain('test-sensitive-token');expect(text).not.toContain('token-value');expect(text).not.toContain('user:password');}finally{delete process.env.TEST_PROVIDER_TOKEN;}
  });
  it('distinguishes a search result from a program failure and keeps the last phase',()=>{
    const failed=optimizationFailure(new Error('Optimizer independent risk verification failed'),false,{phase:'validation',sleeve:'emerging',evaluations:1528});
    expect(failed).toMatchObject({status:'failed',detail:{category:'program',phase:'validation',sleeve:'emerging',evaluations:1528}});expect(failed.detail.reason).toContain('independent risk');
    const search=optimizationFailure(Object.assign(new Error('Not found'),{code:'search_budget_exhausted'}),false,{});expect(search.status).toBe('no_candidate');expect(search.message).toContain('不代表数学上无解');
  });
  it('classifies data, memory, deadline and abort outcomes without reviving the task',()=>{
    expect(optimizationFailure(new Error('Benchmark missing prices'),false,{}).detail.category).toBe('data');
    expect(optimizationFailure(new Error('Worker memory limit'),false,{}).detail.category).toBe('memory');
    expect(optimizationFailure(Object.assign(new Error('Worker terminated due to memory limit'),{code:'ERR_WORKER_OUT_OF_MEMORY'}),false,{}).detail.category).toBe('memory');
    expect(optimizationFailure(new Error('worker time budget reached'),false,{}).code).toBe('optimizer_timeout');
    expect(optimizationFailure(new Error('abort'),true,{}).status).toBe('interrupted');
  });
});
