const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;
const REQUEST_BUDGET_MS = 55000;
const RESPONSE_RESERVE_MS = 2000;
const MIN_ATTEMPT_MS = 1000;
const FAILURE_DETAILS = {
  timeout: {
    statusCode: 504,
    message: 'Google generation timed out before it finished. Please try a shorter topic or try again.'
  },
  rate_limit: {
    statusCode: 429,
    message: 'Google rejected the request because of a rate limit or quota on the API key. Please wait a moment, or enter your own Gemini API key in the form to continue.'
  },
  unavailable: {
    statusCode: 503,
    message: 'Google is temporarily busy or unavailable. Please try again shortly.'
  }
};

class GeminiUnavailableError extends Error {
  constructor({ upstreamStatus = null, model, attempts = 0, elapsedMs = 0, timedOut = false } = {}) {
    const reason = timedOut || upstreamStatus === 408 || upstreamStatus === 504
      ? 'timeout'
      : upstreamStatus === 429 ? 'rate_limit' : 'unavailable';
    const { message, statusCode } = FAILURE_DETAILS[reason];
    super(message);
    this.name = 'GeminiUnavailableError';
    this.reason = reason;
    this.statusCode = statusCode;
    this.upstreamStatus = upstreamStatus;
    this.model = model;
    this.attempts = attempts;
    this.elapsedMs = elapsedMs;
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
    const startedAt = now();
    let upstreamStatus;
    const createFailure = (attempts, timedOut = false) => new GeminiUnavailableError({
      upstreamStatus,
      model: parameters.model,
      attempts,
      elapsedMs: now() - startedAt,
      timedOut
    });

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const remaining = deadline - now();
      if (remaining < MIN_ATTEMPT_MS) throw createFailure(attempt, true);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), remaining);
      let failure;
      try {
        return await ai.models.generateContent({
          ...parameters,
          config: {
            ...parameters.config,
            abortSignal: controller.signal
          }
        });
      } catch (error) {
        if (controller.signal.aborted) throw createFailure(attempt + 1, true);
        failure = error;
      } finally {
        clearTimeout(timer);
      }

      const details = errorDetails(failure);
      upstreamStatus = Number(failure?.status ?? failure?.code ?? details.code);
      if (!RETRYABLE_STATUSES.has(upstreamStatus)) throw failure;
      if (attempt === MAX_ATTEMPTS - 1) throw createFailure(attempt + 1);

      const retryInfo = details.details?.find(detail => detail['@type'] === 'type.googleapis.com/google.rpc.RetryInfo');
      const retryDelay = retryInfo?.retryDelay;
      const serverDelay = typeof retryDelay === 'string' && /^\d+(\.\d+)?s$/.test(retryDelay)
        ? parseFloat(retryDelay) * 1000
        : 0;
      const delay = Math.max(1000 * 2 ** attempt, serverDelay) + Math.floor(random() * 250);
      if (delay + MIN_ATTEMPT_MS > deadline - now()) throw createFailure(attempt + 1);
      await sleep(delay);
    }
  };
}

module.exports = { createGeminiGenerator, GeminiUnavailableError };
