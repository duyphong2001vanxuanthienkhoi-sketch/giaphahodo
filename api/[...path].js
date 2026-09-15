import { getConfig } from '../server/config.js';
import { createApp } from '../server/app.js';

// A warm Vercel instance reuses this promise, so the pool and schema check happen once
// per instance rather than on every request.
let ready;

export default async function handler(req, res) {
  ready ??= createApp(getConfig()).then(context => context.app);
  const app = await ready;
  return app(req, res);
}
