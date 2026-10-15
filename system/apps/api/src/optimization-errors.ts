export function redactDiagnostic(value: unknown): string {
  let text = value instanceof Error ? value.message : String(value);
  for (const [name, secret] of Object.entries(process.env)) {
    if (/TOKEN|PASSWORD|SECRET|ENCRYPTION_KEY|DATABASE_URL/i.test(name) && secret && secret.length >= 6) text = text.split(secret).join('[redacted]');
  }
  return text.replace(/(api_token|token|password|authorization)\s*[=:]\s*[^&\s,;]+/gi, '$1=[redacted]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/[a-f0-9]{14}\.[0-9]{8}/gi, '[redacted]')
    .replace(/(postgres(?:ql)?:\/\/)[^\s]+/gi, '$1[redacted]').slice(0, 1500);
}
export function optimizationFailure(error: unknown, aborted: boolean, progress: Record<string, unknown>) {
  const known = (error && typeof error==='object' ? error : {}) as {code?: string; diagnostics?: unknown};
  const reason = redactDiagnostic(error);
  const code = aborted ? 'optimization_interrupted' : known.code === 'ERR_WORKER_OUT_OF_MEMORY' ? 'optimizer_memory_limit' : known.code ?? (/time budget/i.test(reason) ? 'optimizer_timeout' : /memory|heap/i.test(reason) ? 'optimizer_memory_limit' : /Benchmark|history|prices|window/i.test(reason) ? 'optimization_data_unready' : 'optimization_failed');
  const noCandidate = ['search_budget_exhausted', 'search_no_candidate'].includes(code);
  const category = noCandidate ? 'search' : code === 'optimizer_timeout' || aborted ? 'timeout_or_interruption' : code === 'optimization_data_unready' ? 'data' : code === 'optimizer_memory_limit' ? 'memory' : 'program';
  const message = noCandidate ? '搜索预算内未找到合格方案，不代表数学上无解。' : aborted ? '任务超时或中断，现有组合未改变。' : `优化未完成：${reason}。现有组合未改变。`;
  return {code, message, status: noCandidate ? 'no_candidate' : aborted ? 'interrupted' : 'failed', detail: {category, reason, phase: progress.phase ?? 'unknown', sleeve: progress.sleeve ?? null, evaluations: progress.evaluations ?? 0, recordedAt: new Date().toISOString()}};
}
