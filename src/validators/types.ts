export type ValidatorResult = { ok: true } | { ok: false; reason: string };

export const VALIDATOR_TIMEOUT_MS = 5000;

export async function withTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  label: string
): Promise<T | { __timeout: true; reason: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), VALIDATOR_TIMEOUT_MS);
  try {
    return await fn(ctrl.signal);
  } catch (err) {
    if (ctrl.signal.aborted) {
      return { __timeout: true, reason: `validator timeout: ${label}` };
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
