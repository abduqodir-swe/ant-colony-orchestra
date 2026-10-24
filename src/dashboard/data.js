// Static profile data for the demo colony. Live values (status, progress, events) live in sim.js.

export const STATUS = {
  working: { label: 'WORKING', color: '#4ee07a' },
  testing: { label: 'TESTING', color: '#5fb0ff' },
  reviewing: { label: 'REVIEWING', color: '#b48cff' },
  planning: { label: 'PLANNING', color: '#f2a43a' },
  idle: { label: 'IDLE', color: '#f2d060' },
  break: { label: 'BREAK', color: '#8d97a8' },
};

const M = {
  opus: { model: 'Claude Opus 5.5', provider: 'Anthropic' },
  sonnet: { model: 'Claude Sonnet 5.5', provider: 'Anthropic' },
  gpt: { model: 'GPT-4o', provider: 'OpenAI' },
  gemini: { model: 'Gemini 2.5 Pro', provider: 'Google' },
};

// task: [title, subtask, progress %], tasks rotate when a subtask completes
export const PROFILES = {
  pm_lead: { ...M.opus, title: 'Product Lead', task: ['Sprint 14 planning', 'Prioritise backlog', 38] },
  architect: { ...M.opus, title: 'Software Architect', task: ['Auth service design', 'Token storage ADR', 71] },
  backend_01: { ...M.gpt, title: 'Backend Engineer', task: ['Implement auth module', 'JWT login endpoint', 62] },
  frontend_01: { ...M.sonnet, title: 'Frontend Engineer', task: ['Login screen', 'Form validation', 45] },
  mobile_01: { ...M.sonnet, title: 'Mobile Engineer', task: ['Offline sync', 'Conflict resolution', 27] },
  qa_engineer: { ...M.gemini, title: 'QA Engineer', task: ['Auth regression suite', 'Refresh-token tests', 54] },
  sec_analyst: { ...M.opus, title: 'Security Analyst', task: ['Auth threat model', 'Cookie flags review', 66] },
  devops_01: { ...M.gpt, title: 'DevOps Engineer', task: ['Staging pipeline', 'Deploy auth service', 80] },
  sre_01: { ...M.gemini, title: 'Site Reliability', task: ['Latency alerts', 'p95 dashboard', 33] },
  data_analyst: { ...M.sonnet, title: 'Data Analyst', task: ['Signup funnel', 'Cohort query', 49] },
  researcher: { ...M.gemini, title: 'Researcher', task: ['Passkey support', 'Browser matrix', 18] },
  designer_01: { ...M.sonnet, title: 'Product Designer', task: ['Auth flow UI', 'Error states', 58] },
  writer_01: { ...M.sonnet, title: 'Technical Writer', task: ['Auth API docs', 'Refresh flow guide', 41] },
};

export const NEXT_SUBTASKS = ['Write unit tests', 'Refactor handlers', 'Update docs', 'Code review fixes', 'Edge cases', 'Performance pass', 'Integration check'];

// event type -> dot colour; agents emit role-flavoured events while they work
export const EVENTS = {
  TOOL_CALLED: '#5fb0ff',
  TOOL_COMPLETED: '#4ee07a',
  TOOL_APPROVED: '#4ee07a',
  TOOL_DENIED: '#e0503c',
  TEST_STARTED: '#f2a43a',
  TEST_PASSED: '#4ee07a',
  SECURITY_REVIEW_STARTED: '#f2d060',
  AGENT_STATE_CHANGED: '#e0703c',
  APPROVAL_REQUESTED: '#b48cff',
  TASK_COMPLETED: '#4ee07a',
  COMMIT_PUSHED: '#5fd0f5',
  PLAN_UPDATED: '#f2a43a',
  // backend run lifecycle
  TASK_QUEUED: '#8d97a8',
  RUN_STARTED: '#8b7cff',
  TASK_ASSIGNED: '#5fb0ff',
  TOOL_FAILED: '#e0503c',
  TEST_FAILED: '#e0503c',
  AGENT_ERROR: '#e0503c',
  RUN_COMPLETED: '#4ee07a',
  RUN_FAILED: '#e0503c',
  RUN_CANCELLED: '#8d97a8',
  RUN_INTERRUPTED: '#f2a43a',
};

export const ROLE_EVENTS = {
  PM: ['PLAN_UPDATED', 'TOOL_CALLED'],
  Architect: ['TOOL_CALLED', 'PLAN_UPDATED', 'TOOL_COMPLETED'],
  Backend: ['TOOL_CALLED', 'TOOL_COMPLETED', 'COMMIT_PUSHED'],
  Frontend: ['TOOL_CALLED', 'COMMIT_PUSHED', 'TEST_STARTED'],
  Mobile: ['TOOL_CALLED', 'COMMIT_PUSHED'],
  QA: ['TEST_STARTED', 'TEST_PASSED', 'TOOL_CALLED'],
  Security: ['SECURITY_REVIEW_STARTED', 'TOOL_CALLED'],
  DevOps: ['TOOL_CALLED', 'TOOL_COMPLETED'],
  SRE: ['TOOL_CALLED', 'TOOL_COMPLETED'],
  Analytics: ['TOOL_CALLED', 'TOOL_COMPLETED'],
  Research: ['TOOL_CALLED'],
  Design: ['TOOL_CALLED', 'COMMIT_PUSHED'],
  Docs: ['TOOL_CALLED', 'COMMIT_PUSHED'],
};

export const REQUIREMENTS = [
  { name: 'Authentication System', done: 3, total: 5 },
  { name: 'User Management', done: 4, total: 6 },
  { name: 'API & Backend', done: 5, total: 8 },
  { name: 'UI / Frontend', done: 2, total: 6 },
  { name: 'Testing & QA', done: 1, total: 5 },
];

export const APPROVAL_POOL = [
  { title: 'Deploy to staging', agent: 'devops_01' },
  { title: 'Access production DB', agent: 'backend_01' },
  { title: 'Rotate API keys', agent: 'sec_analyst' },
  { title: 'Merge PR #42 into main', agent: 'frontend_01' },
  { title: 'Scale workers to 6', agent: 'sre_01' },
  { title: 'Send survey to beta users', agent: 'data_analyst' },
];

export const TASK_DETAILS = {
  'Implement auth module': { desc: 'JWT based login, refresh tokens, secure cookies', priority: 'High', points: 8, due: 'Сегодня 18:00' },
};
export const DEFAULT_DETAILS = { desc: 'Часть спринта 14', priority: 'Medium', points: 5, due: 'Завтра 12:00' };
