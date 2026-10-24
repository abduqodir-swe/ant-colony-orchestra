// Process environment and paths. index.ts imports this module first, so everything below is in
// place before any Mastra module reads process.env.

import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SERVER_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const ROOT_DIR = resolve(SERVER_DIR, '..');

const envFile = join(SERVER_DIR, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

// Mastra ships anonymous usage telemetry (PostHog); keep it off unless the operator opts in.
process.env.MASTRA_TELEMETRY_DISABLED ??= '1';

export const DATA_DIR = resolve(process.env.ANT_DATA_DIR || join(SERVER_DIR, 'data'));
export const WORKSPACE_DIR = resolve(process.env.ANT_WORKSPACE || join(SERVER_DIR, 'workspace'));
mkdirSync(DATA_DIR, { recursive: true });
mkdirSync(WORKSPACE_DIR, { recursive: true });

export const HOST = process.env.ANT_HOST || '127.0.0.1';
export const PORT = Number(process.env.ANT_PORT || 8787);
export const SANDBOX_NETWORK = process.env.ANT_SANDBOX_NETWORK === '1';
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
export type Effort = (typeof EFFORTS)[number];
const wantedEffort = process.env.ANT_EFFORT || 'high';
export const EFFORT: Effort = (EFFORTS as readonly string[]).includes(wantedEffort) ? (wantedEffort as Effort) : 'high';
