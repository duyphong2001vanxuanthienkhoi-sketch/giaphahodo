import { getConfig } from '../server/config.js';
import { createApp } from '../server/app.js';

// A warm Vercel instance reuses this promise, so the pool and schema check happen once
// per instance rather than on every request.
let ready;

export default async function handler(req, res) {
  try {
    ready ??= createApp(getConfig()).then(context => context.app);
    return (await ready)(req, res);
  } catch (error) {
    // Without this the platform answers FUNCTION_INVOCATION_FAILED and the real cause —
    // almost always a missing setting — is only visible in the dashboard log. Clearing
    // `ready` lets the next request try again once the setting is corrected.
    ready = undefined;
    console.error('[Cội] Không khởi động được:', error);
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'Cội chưa khởi động được: ' + (error?.message || String(error)) }));
  }
}
