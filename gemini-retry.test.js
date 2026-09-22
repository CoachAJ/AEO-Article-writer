const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const { ApiError, GoogleGenAI } = require('@google/genai');
const { createGeminiGenerator, GeminiUnavailableError } = require('./gemini-retry');

function apiError(status, details = []) {
  return new ApiError({ status, message: JSON.stringify({ error: { code: status, details } }) });
}

function setup(outcomes, budget = 60000, random = 0.5) {
  let clock = 0;
  const calls = [];
  const delays = [];
  const generate = createGeminiGenerator({ getRemainingTimeInMillis: () => budget }, {
    now: () => clock,
    random: () => random,
    sleep: async ms => { delays.push(ms); clock += ms; }
  });
  const ai = { models: { generateContent: async parameters => {
    calls.push(parameters);
    const outcome = outcomes[Math.min(calls.length - 1, outcomes.length - 1)];
    if (outcome instanceof Error) throw outcome;
    return typeof outcome === 'function' ? outcome(parameters) : outcome;
  } } };
  return { generate, ai, calls, delays, advance: ms => { clock += ms; } };
}

const parameters = { model: 'test-model', contents: 'test prompt', config: { temperature: 0.7 } };

test('successful requests preserve parameters and return without retries', async () => {
  const result = { text: 'success' };
  const h = setup([result]);
  assert.equal(await h.generate(h.ai, parameters), result);
  assert.equal(h.calls.length, 1);
  assert.deepEqual(h.delays, []);
  assert.equal(h.calls[0].model, parameters.model);
  assert.equal(h.calls[0].contents, parameters.contents);
  assert.equal(h.calls[0].config.temperature, 0.7);
  assert.equal(h.calls[0].config.httpOptions.timeout, 55000);
  assert.equal(parameters.config.abortSignal, undefined);
});

for (const status of [408, 429, 500, 502, 503, 504]) {
  test(`retries ${status} with exponential backoff and jitter`, async () => {
    const h = setup([apiError(status), apiError(status), { text: 'recovered' }]);
    assert.deepEqual(await h.generate(h.ai, parameters), { text: 'recovered' });
    assert.equal(h.calls.length, 3);
    assert.deepEqual(h.delays, [1125, 2125]);
    assert.deepEqual(h.calls.map(call => call.config.httpOptions.timeout), [55000, 53875, 51750]);
  });
}

for (const status of [400, 401, 402, 403, 404, 501]) {
  test(`does not retry ${status}`, async () => {
    const error = apiError(status);
    const h = setup([error]);
    await assert.rejects(h.generate(h.ai, parameters), failure => failure === error);
    assert.equal(h.calls.length, 1);
    assert.deepEqual(h.delays, []);
  });
}

test('does not infer retryability from arbitrary error message text', async () => {
  const error = new Error('Invalid prompt contains 503');
  const h = setup([error]);
  await assert.rejects(h.generate(h.ai, parameters), failure => failure === error);
  assert.equal(h.calls.length, 1);
});

test('recognizes a structured JSON error without a top-level status', async () => {
  const h = setup([new Error('{"error":{"code":503}}'), { text: 'recovered' }]);
  assert.deepEqual(await h.generate(h.ai, parameters), { text: 'recovered' });
  assert.equal(h.calls.length, 2);
});

test('stops after three attempts and returns a safe friendly error', async () => {
  const h = setup([apiError(503)]);
  await assert.rejects(h.generate(h.ai, parameters), error => {
    assert.ok(error instanceof GeminiUnavailableError);
    assert.match(error.message, /Google is temporarily busy/);
    assert.doesNotMatch(error.message, /"code"|"details"/);
    return true;
  });
  assert.equal(h.calls.length, 3);
  assert.equal(h.delays.length, 2);
});

test('honors Google RetryInfo without exceeding the deadline', async () => {
  const details = [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '4.5s' }];
  const h = setup([apiError(429, details), { text: 'recovered' }]);
  await h.generate(h.ai, parameters);
  assert.deepEqual(h.delays, [4625]);
  const limited = setup([apiError(429, details)], 6000);
  await assert.rejects(limited.generate(limited.ai, parameters), GeminiUnavailableError);
  assert.equal(limited.calls.length, 1);
  assert.deepEqual(limited.delays, []);
});

test('shares the deadline between text and image calls and reserves response time', async () => {
  const h = setup([{ text: 'article' }], 10000);
  await h.generate(h.ai, parameters);
  assert.equal(h.calls[0].config.httpOptions.timeout, 8000);
  h.advance(6500);
  await h.generate(h.ai, parameters);
  assert.equal(h.calls[1].config.httpOptions.timeout, 1500);
  h.advance(1000);
  await assert.rejects(h.generate(h.ai, parameters), GeminiUnavailableError);
  assert.equal(h.calls.length, 2);
});

test('does not sleep or retry without sufficient remaining time', async () => {
  const h = setup([apiError(503)], 4000);
  await assert.rejects(h.generate(h.ai, parameters), GeminiUnavailableError);
  assert.equal(h.calls.length, 1);
  assert.deepEqual(h.delays, []);
});

test('checks the deadline again after an unexpectedly slow backoff', async () => {
  let clock = 0;
  let calls = 0;
  const generate = createGeminiGenerator(undefined, {
    now: () => clock,
    sleep: async () => { clock = 60000; }
  });
  const ai = { models: { generateContent: async () => { calls++; throw apiError(503); } } };
  await assert.rejects(generate(ai, parameters), GeminiUnavailableError);
  assert.equal(calls, 1);
});

test('cancels an in-flight request at the deadline without retrying it', async () => {
  let signal;
  const h = setup([request => new Promise((resolve, reject) => {
    signal = request.config.abortSignal;
    signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  })], 3000);
  await assert.rejects(h.generate(h.ai, parameters), GeminiUnavailableError);
  assert.equal(signal.aborted, true);
  assert.equal(h.calls.length, 1);
  assert.deepEqual(h.delays, []);
});

test('the real Google SDK aborts an in-flight HTTP request at the deadline', async t => {
  let signal;
  t.mock.method(globalThis, 'fetch', (url, options) => new Promise((resolve, reject) => {
    signal = options.signal;
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  }));
  const generate = createGeminiGenerator({ getRemainingTimeInMillis: () => 3500 });
  const ai = new GoogleGenAI({ apiKey: 'mock-key' });
  await assert.rejects(generate(ai, parameters), GeminiUnavailableError);
  assert.equal(signal.aborted, true);
  assert.equal(globalThis.fetch.mock.callCount(), 1);
});

test('does not start a request when the execution budget is already exhausted', async () => {
  const h = setup([{ text: 'unused' }], 1000);
  await assert.rejects(h.generate(h.ai, parameters), GeminiUnavailableError);
  assert.equal(h.calls.length, 0);
});

test('each request receives its own independent budget', async () => {
  const first = setup([{ text: 'first' }]);
  const second = setup([{ text: 'second' }]);
  first.advance(56000);
  await assert.rejects(first.generate(first.ai, parameters), GeminiUnavailableError);
  assert.deepEqual(await second.generate(second.ai, parameters), { text: 'second' });
});

test('local and Netlify endpoints use retries through the real Google SDK', async t => {
  const originalLoad = Module._load;
  const routes = {};
  const app = { use() {}, post(path, handler) { routes[path] = handler; }, get() {}, listen() {} };
  const express = Object.assign(() => app, { json() {}, static() {} });
  t.mock.method(Module, '_load', function (id, ...args) {
    if (id === 'express') return express;
    if (id === 'dotenv') return { config() {} };
    if (id === './gemini-retry' || id === '../../gemini-retry') {
      return {
        GeminiUnavailableError,
        createGeminiGenerator: context => {
          let clock = 0;
          return createGeminiGenerator(context, {
            now: () => clock,
            sleep: async ms => { clock += ms; },
            random: () => 0.5
          });
        }
      };
    }
    return originalLoad.call(this, id, ...args);
  });
  require('./server');
  const generate = require('./netlify/functions/generate').handler;
  const regenerate = require('./netlify/functions/regenerate-image').handler;
  const previousKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'mock-server-key';
  t.after(() => {
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
  });
  t.mock.method(console, 'error', () => {});

  const content = { articleMarkdown: '# Saved article', imagePrompt: 'Test scene', mediumCopy: 'Medium', linkedinCopy: 'LinkedIn' };
  const article = { candidates: [{ content: { parts: [{ text: JSON.stringify(content) }] } }] };
  const image = { candidates: [{ content: { parts: [{ inlineData: { data: 'dGVzdA==', mimeType: 'image/png' } }] } }] };
  const body = { topic: 'SEO', businessType: 'Marketing', imageProvider: 'none' };

  function mockResponses(subtest, outcomes) {
    const requests = [];
    subtest.mock.method(globalThis, 'fetch', async (url, options) => {
      assert.match(String(url), /^https:\/\/generativelanguage\.googleapis\.com\//);
      requests.push({ url: String(url), body: JSON.parse(options.body), headers: new Headers(options.headers) });
      const outcome = outcomes[Math.min(requests.length - 1, outcomes.length - 1)];
      const status = typeof outcome === 'number' ? outcome : 200;
      return new Response(JSON.stringify(status === 200 ? outcome : { error: { code: status, message: 'Test upstream failure' } }), {
        status, headers: { 'Content-Type': 'application/json' }
      });
    });
    return requests;
  }

  async function invoke(platform, route, requestBody) {
    if (platform === 'netlify') {
      const handler = route === '/api/generate' ? generate : regenerate;
      const response = await handler({ httpMethod: 'POST', body: JSON.stringify(requestBody) }, { getRemainingTimeInMillis: () => 60000 });
      return { status: response.statusCode, body: JSON.parse(response.body) };
    }
    const response = { status: 200 };
    await routes[route]({ body: requestBody }, {
      status(code) { response.status = code; return this; },
      json(data) { response.body = data; }
    });
    return response;
  }

  for (const platform of ['local', 'netlify']) {
    await t.test(`${platform}: text recovers after 503`, async st => {
      const requests = mockResponses(st, [503, article]);
      const response = await invoke(platform, '/api/generate', body);
      assert.equal(response.status, 200);
      assert.equal(response.body.articleMarkdown, content.articleMarkdown);
      assert.equal(requests.length, 2);
      assert.deepEqual(requests[0].body, requests[1].body);
      assert.ok(requests.every(request => request.url.includes('gemini-3.6-flash')));
    });

    await t.test(`${platform}: persistent text overload returns friendly 503`, async st => {
      const requests = mockResponses(st, [503]);
      const response = await invoke(platform, '/api/generate', body);
      assert.equal(response.status, 503);
      assert.match(response.body.error, /Google is temporarily busy/);
      assert.equal(requests.length, 3);
    });

    await t.test(`${platform}: missing model is not retried`, async st => {
      const requests = mockResponses(st, [404]);
      const response = await invoke(platform, '/api/generate', body);
      assert.equal(response.status, 500);
      assert.equal(requests.length, 1);
    });

    for (const imageProvider of ['gemini', 'gemini-imagen']) {
      const imageBody = { ...body, imageProvider, imagePrompt: 'Test scene', userGeminiKey: 'mock-user-key' };
      await t.test(`${platform}/${imageProvider}: image generation recovers without regenerating text`, async st => {
        const requests = mockResponses(st, [article, 503, image]);
        const response = await invoke(platform, '/api/generate', imageBody);
        assert.equal(response.status, 200);
        assert.equal(response.body.articleMarkdown, content.articleMarkdown);
        assert.equal(response.body.imageUrl, 'data:image/png;base64,dGVzdA==');
        assert.equal(response.body.imageError, null);
        assert.equal(requests.length, 3);
        assert.ok(requests[0].url.includes('gemini-3.6-flash'));
        assert.ok(requests.slice(1).every(request => request.url.includes('gemini-3-pro-image-preview')));
      });

      await t.test(`${platform}/${imageProvider}: failed images preserve the article`, async st => {
        const requests = mockResponses(st, [article, 503]);
        const response = await invoke(platform, '/api/generate', imageBody);
        assert.equal(response.status, 200);
        assert.equal(response.body.success, true);
        assert.equal(response.body.articleMarkdown, content.articleMarkdown);
        assert.equal(response.body.mediumCopy, content.mediumCopy);
        assert.equal(response.body.linkedinCopy, content.linkedinCopy);
        assert.equal(response.body.imageUrl, null);
        assert.match(response.body.imageError, /Google is temporarily busy/);
        assert.equal(requests.length, 4);
        assert.equal(requests[1].headers.get('x-goog-api-key'), imageProvider === 'gemini' ? 'mock-server-key' : 'mock-user-key');
      });

      await t.test(`${platform}/${imageProvider}: image regeneration recovers`, async st => {
        const requests = mockResponses(st, [503, image]);
        const response = await invoke(platform, '/api/regenerate-image', imageBody);
        assert.equal(response.status, 200);
        assert.equal(response.body.imageUrl, 'data:image/png;base64,dGVzdA==');
        assert.equal(requests.length, 2);
      });

      await t.test(`${platform}/${imageProvider}: image regeneration exhausts retries`, async st => {
        const requests = mockResponses(st, [503]);
        const response = await invoke(platform, '/api/regenerate-image', imageBody);
        assert.equal(response.status, 503);
        assert.match(response.body.error, /Google is temporarily busy/);
        assert.equal(requests.length, 3);
      });
    }
  }
});
