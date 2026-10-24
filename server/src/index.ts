// Ant Colony backend entry point: Mastra agents + SQLite event log + SSE, serving the office UI.

import { DATA_DIR, HOST, PORT, WORKSPACE_DIR } from './env.ts';
import { join } from 'node:path';
import { buildColony } from './agents.ts';
import { missingKeys, modelFor, resolveMode, ROSTER } from './config.ts';
import { startHttp } from './http.ts';
import { sampleHost } from './metrics.ts';
import { Colony } from './runtime.ts';
import { Store } from './store.ts';

const mode = resolveMode();
const store = new Store(join(DATA_DIR, 'colony.db'));
const colony = new Colony(store, mode);
const { pm, isolation } = buildColony({ mode, sink: colony, hooks: colony });
colony.attach(pm, isolation);
colony.recover();

const health = () => ({
  ok: true,
  mode,
  isolation,
  missingKeys: missingKeys(),
  workspace: WORKSPACE_DIR,
  agents: ROSTER.length,
});

const { clients } = startHttp(colony, health);

setInterval(() => {
  colony.broadcast({ kind: 'system', data: { ...sampleHost(WORKSPACE_DIR), tokensPerMin: colony.tokensPerMinute(), sseClients: clients.size } });
}, 2000).unref();

const models = [...new Set(ROSTER.map((a) => modelFor(a.id)))].join(', ');
console.log(`
  Ant Colony server  http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}
  mode       ${mode}${mode === 'mock' ? `  (scripted agents, no API calls${missingKeys().length ? `; missing ${missingKeys().join(', ')}` : ''})` : ''}
  models     ${models}
  sandbox    ${isolation === 'none' ? 'none - shell commands need approval' : isolation}
  workspace  ${WORKSPACE_DIR}
  data       ${DATA_DIR}
`);
if (isolation === 'none') console.warn('  ! No OS sandbox available: every shell command will wait for approval.\n');
if (!['127.0.0.1', 'localhost', '::1'].includes(HOST)) console.warn(`  ! Listening on ${HOST}: anyone on this network can drive the agents.\n`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    store.close();
    process.exit(0);
  });
}
