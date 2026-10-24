// The colony roster: one PM (the supervisor) and twelve specialists. Ids match the ants in the
// office UI. Models are Mastra router strings ("provider/model"); override one agent with
// ANT_MODEL_<ID> or everyone with ANT_MODEL_DEFAULT.

export type Status = 'idle' | 'planning' | 'working' | 'testing' | 'reviewing';

// Capabilities an agent can be given; agents.ts turns each into concrete tools.
export type Capability = 'workspace' | 'workspaceRead' | 'tests' | 'deploy' | 'merge' | 'prodDb' | 'rotateKeys';

export interface AgentSpec {
  id: string;
  role: string; // short label for the agent list
  title: string; // job title for the inspector
  busy: Status; // status shown while the agent has work
  description: string; // what the PM reads when choosing whom to delegate to
  focus: string; // role-specific working rules
  capabilities: Capability[];
}

export const PM_ID = 'pm_lead';

export const PM: AgentSpec = {
  id: PM_ID,
  role: 'PM',
  title: 'Product Lead',
  busy: 'planning',
  description: 'Plans the work and coordinates the team.',
  focus: '',
  capabilities: [],
};

export const SPECIALISTS: AgentSpec[] = [
  {
    id: 'architect',
    role: 'Architect',
    title: 'Software Architect',
    busy: 'working',
    description: 'Designs system structure, module boundaries and data models; writes short ADRs in docs/adr/. Use before larger changes.',
    focus: 'Prefer simple designs. Record decisions as short ADRs (context, decision, consequences) in docs/adr/.',
    capabilities: ['workspace'],
  },
  {
    id: 'backend_01',
    role: 'Backend',
    title: 'Backend Engineer',
    busy: 'working',
    description: 'Implements server code, APIs, data access and their unit tests.',
    focus: 'Write small, testable modules with node:test unit tests next to the code. Validate inputs at the boundary.',
    capabilities: ['workspace', 'tests', 'prodDb'],
  },
  {
    id: 'frontend_01',
    role: 'Frontend',
    title: 'Frontend Engineer',
    busy: 'working',
    description: 'Implements web UI: HTML, CSS, JavaScript components and their tests.',
    focus: 'Keep markup semantic and accessible. Plain HTML/CSS/JS unless the project already uses a framework.',
    capabilities: ['workspace', 'tests'],
  },
  {
    id: 'mobile_01',
    role: 'Mobile',
    title: 'Mobile Engineer',
    busy: 'working',
    description: 'Builds mobile and responsive experiences, offline behaviour and sync.',
    focus: 'Design for small screens and flaky networks first.',
    capabilities: ['workspace', 'tests'],
  },
  {
    id: 'qa_engineer',
    role: 'QA',
    title: 'QA Engineer',
    busy: 'testing',
    description: 'Writes and runs tests, reproduces bugs and reports what fails and why.',
    focus: 'Run the test suite first. Add missing tests for edge cases. Report failures with the exact failing case.',
    capabilities: ['workspace', 'tests'],
  },
  {
    id: 'sec_analyst',
    role: 'Security',
    title: 'Security Analyst',
    busy: 'reviewing',
    description: 'Reviews code and configuration for security problems; can rotate API keys (needs approval).',
    focus: 'Look for injection, secrets in code, missing input validation and unsafe defaults. Report findings by severity with file:line.',
    capabilities: ['workspaceRead', 'rotateKeys'],
  },
  {
    id: 'devops_01',
    role: 'DevOps',
    title: 'DevOps Engineer',
    busy: 'working',
    description: 'Build scripts, CI config, deploys to staging and merges to main (both need approval).',
    focus: 'Make builds reproducible. Only deploy or merge after tests pass.',
    capabilities: ['workspace', 'tests', 'deploy', 'merge'],
  },
  {
    id: 'sre_01',
    role: 'SRE',
    title: 'Site Reliability',
    busy: 'working',
    description: 'Monitoring, alerts, health checks and performance budgets.',
    focus: 'Prefer measurable signals: health endpoints, timings, error rates.',
    capabilities: ['workspace', 'tests'],
  },
  {
    id: 'data_analyst',
    role: 'Analytics',
    title: 'Data Analyst',
    busy: 'working',
    description: 'Analyses data files in the workspace and writes small analysis scripts and reports.',
    focus: 'Show numbers with their source. Keep scripts runnable with plain Node.',
    capabilities: ['workspace'],
  },
  {
    id: 'researcher',
    role: 'Research',
    title: 'Researcher',
    busy: 'working',
    description: 'Reads the existing project and summarises options and trade-offs before work starts.',
    focus: 'Read before you conclude. Cite files you looked at.',
    capabilities: ['workspaceRead'],
  },
  {
    id: 'designer_01',
    role: 'Design',
    title: 'Product Designer',
    busy: 'working',
    description: 'UI/UX specs, layouts, design tokens and CSS for new screens.',
    focus: 'Describe states (empty, loading, error) as well as the happy path.',
    capabilities: ['workspace'],
  },
  {
    id: 'writer_01',
    role: 'Docs',
    title: 'Technical Writer',
    busy: 'reviewing',
    description: 'Writes READMEs, API docs and changelogs for finished work.',
    focus: 'Short sentences, runnable examples, document what exists rather than plans.',
    capabilities: ['workspace'],
  },
];

export const ROSTER: AgentSpec[] = [PM, ...SPECIALISTS];

export const DEFAULT_MODEL = process.env.ANT_MODEL_DEFAULT || 'anthropic/claude-opus-5-5';

export function modelFor(id: string): string {
  return process.env[`ANT_MODEL_${id.toUpperCase()}`] || DEFAULT_MODEL;
}

export const providerOf = (model: string) => model.split('/')[0] ?? '';

// API key variables per provider. Providers not listed (local gateways, ollama) need no key.
const KEY_ENV: Record<string, string[]> = {
  anthropic: ['ANTHROPIC_API_KEY'],
  openai: ['OPENAI_API_KEY'],
  google: ['GOOGLE_GENERATIVE_AI_API_KEY', 'GOOGLE_API_KEY'],
  openrouter: ['OPENROUTER_API_KEY'],
  groq: ['GROQ_API_KEY'],
  deepseek: ['DEEPSEEK_API_KEY'],
  mistral: ['MISTRAL_API_KEY'],
  xai: ['XAI_API_KEY'],
};

export function missingKeys(): string[] {
  const missing = new Set<string>();
  for (const a of ROSTER) {
    const envs = KEY_ENV[providerOf(modelFor(a.id))];
    if (envs && !envs.some((e) => process.env[e])) missing.add(envs[0]);
  }
  return [...missing];
}

export type Mode = 'live' | 'mock';

export function resolveMode(): Mode {
  const wanted = process.env.ANT_MODE || 'auto';
  if (wanted === 'mock') return 'mock';
  if (wanted === 'live') return 'live';
  return missingKeys().length ? 'mock' : 'live';
}
