const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;
const REQUEST_BUDGET_MS = 55000;
const RESPONSE_RESERVE_MS = 2000;
const MIN_ATTEMPT_MS = 1000;

class GeminiUnavailableError extends Error {
  constructor() {
    super('Google is temporarily busy or unavailable. Please try again shortly.');
    this.name = 'GeminiUnavailableError';
  }
}

function errorDetails(error) {
  if (error?.error) return error.error;
  try {
    return JSON.parse(error.message).error || {};
  } catch {
    return {};
  }
}

function createGeminiGenerator(context, {
  now = Date.now,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  random = Math.random
} = {}) {
  const availableTime = context?.getRemainingTimeInMillis?.() ?? REQUEST_BUDGET_MS + RESPONSE_RESERVE_MS;
  const deadline = now() + Math.min(REQUEST_BUDGET_MS, availableTime - RESPONSE_RESERVE_MS);

  return async (ai, parameters) => {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const remaining = deadline - now();
      if (remaining < MIN_ATTEMPT_MS) throw new GeminiUnavailableError();

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), remaining);
      let failure;
      try {
        return await ai.models.generateContent({
          ...parameters,
          config: {
            ...parameters.config,
            abortSignal: controller.signal,
            httpOptions: {
              ...parameters.config?.httpOptions,
              timeout: remaining
            }
          }
        });
      } catch (error) {
        if (controller.signal.aborted) throw new GeminiUnavailableError();
        failure = error;
      } finally {
        clearTimeout(timer);
      }

      const details = errorDetails(failure);
      const status = Number(failure?.status ?? failure?.code ?? details.code);
      if (!RETRYABLE_STATUSES.has(status)) throw failure;
      if (attempt === MAX_ATTEMPTS - 1) throw new GeminiUnavailableError();

      const retryInfo = details.details?.find(detail => detail['@type'] === 'type.googleapis.com/google.rpc.RetryInfo');
      const retryDelay = retryInfo?.retryDelay;
      const serverDelay = typeof retryDelay === 'string' && /^\d+(\.\d+)?s$/.test(retryDelay)
        ? parseFloat(retryDelay) * 1000
        : 0;
      const delay = Math.max(1000 * 2 ** attempt, serverDelay) + Math.floor(random() * 250);
      if (delay + MIN_ATTEMPT_MS > deadline - now()) throw new GeminiUnavailableError();
      await sleep(delay);
    }
  };
}

module.exports = { createGeminiGenerator, GeminiUnavailableError };
