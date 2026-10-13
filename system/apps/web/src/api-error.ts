export function apiErrorMessage(body: Record<string, any>, fallback = 'Request failed'): string {
  // Fastify's default response has error="Conflict" but the useful detail in message.
  if (typeof body.message === 'string' && body.message.trim()) return body.message;
  if (Array.isArray(body.issues) && body.issues.length) return body.issues.map((issue: any) => `${(issue.path ?? []).join('.')}: ${issue.message}`).join('; ');
  return typeof body.error === 'string' ? body.error : fallback;
}
