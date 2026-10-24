// Scripted stand-in for an LLM (AI SDK LanguageModelV2), used when ANT_MODE=mock or no API keys are
// set. Each agent follows a fixed script, picking the next step from how many tool calls the
// conversation already holds, so a whole run - plan, delegation, real file writes, real test runs
// and an approval-gated deploy - can be exercised for free.

import type {
  LanguageModelV2,
  LanguageModelV2CallOptions,
  LanguageModelV2Content,
  LanguageModelV2FunctionTool,
  LanguageModelV2StreamPart,
  LanguageModelV2Usage,
} from '@ai-sdk/provider-v5';

type Step = { text: string } | { tool: string; args: Record<string, unknown> };

const DELAY = Number(process.env.ANT_MOCK_DELAY_MS ?? 700);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const HEALTH_JS = `// Health check used by the staging probe.
export function health(now = new Date()) {
  return { status: 'ok', time: now.toISOString() };
}
`;

const HEALTH_TEST = `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { health } from './health.js';

test('reports ok', () => {
  assert.equal(health().status, 'ok');
});

test('uses the given clock', () => {
  const t = new Date('2026-01-01T00:00:00Z');
  assert.equal(health(t).time, '2026-01-01T00:00:00.000Z');
});
`;

function pmScript(task: string): Step[] {
  const plan = (statuses: string[]) => ({
    tool: 'update_plan',
    args: {
      items: [
        { title: 'Health-модуль и тесты', owner: 'backend_01' },
        { title: 'Прогон тестов', owner: 'qa_engineer' },
        { title: 'Ревью безопасности', owner: 'sec_analyst' },
        { title: 'Деплой на staging', owner: 'devops_01' },
      ].map((it, i) => ({ ...it, status: statuses[i] })),
    },
  });
  return [
    plan(['doing', 'todo', 'todo', 'todo']),
    { tool: 'agent-backend_01', args: { prompt: `Задача пользователя: «${task}». Создай app/health.js с функцией health() и тесты app/health.test.js, затем запусти тесты.` } },
    plan(['done', 'doing', 'todo', 'todo']),
    { tool: 'agent-qa_engineer', args: { prompt: 'Запусти тесты проекта и сообщи результат.' } },
    plan(['done', 'done', 'doing', 'todo']),
    { tool: 'agent-sec_analyst', args: { prompt: 'Проверь app/health.js на проблемы безопасности.' } },
    plan(['done', 'done', 'done', 'doing']),
    { tool: 'agent-devops_01', args: { prompt: 'Задеплой сервис health на staging, тесты зелёные.' } },
    plan(['done', 'done', 'done', 'done']),
    { text: `Готово: «${task}». Health-модуль написан, тесты проходят, ревью безопасности без замечаний, деплой на staging запрошен через одобрение. (Демо-режим: ответы сценарные.)` },
  ];
}

function specialistScript(agent: string, lastResult: string): Step[] {
  switch (agent) {
    case 'backend_01':
      return [
        { tool: 'mastra_workspace_write_file', args: { path: 'app/health.js', content: HEALTH_JS } },
        { tool: 'mastra_workspace_write_file', args: { path: 'app/health.test.js', content: HEALTH_TEST } },
        { tool: 'run_tests', args: { paths: ['app'] } },
        { text: 'Создал app/health.js и app/health.test.js. Тесты запущены, результат выше.' },
      ];
    case 'qa_engineer':
      return [{ tool: 'run_tests', args: {} }, { text: `Прогнал тесты. ${/"passed":\s*true/.test(lastResult) ? 'Все зелёные.' : 'Есть падения, см. вывод.'}` }];
    case 'sec_analyst':
      return [{ tool: 'mastra_workspace_read_file', args: { path: 'app/health.js' } }, { text: 'Проверил app/health.js: внешнего ввода и секретов нет, замечаний нет.' }];
    case 'devops_01':
      return [
        { tool: 'deploy_staging', args: { service: 'health', version: '0.1.0', notes: 'first deploy' } },
        { text: /not approved|declined/i.test(lastResult) ? 'Деплой отклонён человеком, ничего не выкатывал.' : 'Сервис health выкачен на staging (симуляция).' },
      ];
    default:
      return [{ text: 'Готово.' }];
  }
}

// Fill a tool's arguments from the step, keeping only properties the tool declares and mapping a
// generic prompt onto whatever required string field a delegation tool uses.
function fitArgs(tool: LanguageModelV2FunctionTool | undefined, args: Record<string, unknown>) {
  const schema = (tool?.inputSchema ?? {}) as { properties?: Record<string, unknown>; required?: string[] };
  const props = schema.properties ? Object.keys(schema.properties) : null;
  if (!props) return args;
  const out: Record<string, unknown> = {};
  for (const k of props) if (k in args) out[k] = args[k];
  const textual = args.prompt ?? args.content;
  for (const k of schema.required ?? []) if (!(k in out) && typeof textual === 'string') out[k] = textual;
  return out;
}

function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map((p: { type?: string; text?: string }) => (p.type === 'text' ? (p.text ?? '') : '')).join('');
}

export class ScriptedModel implements LanguageModelV2 {
  readonly specificationVersion = 'v2';
  readonly provider = 'mock';
  readonly modelId: string;
  readonly supportedUrls = {};
  private agent: string;

  constructor(agent: string) {
    this.agent = agent;
    this.modelId = `scripted-${agent}`;
  }

  private next(options: LanguageModelV2CallOptions): Step {
    // Subagents also see the parent's conversation, so only count calls to this agent's own tools.
    const own = new Set((options.tools ?? []).map((t) => t.name));
    let calls = 0;
    let lastResult = '';
    let task = '';
    for (const m of options.prompt) {
      if (m.role === 'assistant') calls += m.content.filter((p) => p.type === 'tool-call' && own.has(p.toolName)).length;
      if (m.role === 'tool') {
        const mine = m.content.filter((p) => p.type === 'tool-result' && own.has(p.toolName));
        if (mine.length) lastResult = JSON.stringify(mine);
      }
      if (m.role === 'user') task = textOf(m.content) || task;
    }
    const script = this.agent === 'pm_lead' ? pmScript(task.trim().slice(0, 140)) : specialistScript(this.agent, lastResult);
    return script[Math.min(calls, script.length - 1)];
  }

  private usage(options: LanguageModelV2CallOptions, out: number): LanguageModelV2Usage {
    const input = Math.round(JSON.stringify(options.prompt).length / 4);
    return { inputTokens: input, outputTokens: out, totalTokens: input + out };
  }

  async doGenerate(options: LanguageModelV2CallOptions) {
    const step = this.next(options);
    const tools = (options.tools ?? []).filter((t): t is LanguageModelV2FunctionTool => t.type === 'function');
    const content: LanguageModelV2Content[] =
      'text' in step
        ? [{ type: 'text', text: step.text }]
        : [{ type: 'tool-call', toolCallId: crypto.randomUUID(), toolName: step.tool, input: JSON.stringify(fitArgs(tools.find((t) => t.name === step.tool), step.args)) }];
    return {
      content,
      finishReason: 'text' in step ? ('stop' as const) : ('tool-calls' as const),
      usage: this.usage(options, 40),
      warnings: [],
    };
  }

  async doStream(options: LanguageModelV2CallOptions) {
    const step = this.next(options);
    const tools = (options.tools ?? []).filter((t): t is LanguageModelV2FunctionTool => t.type === 'function');
    const usage = (n: number) => this.usage(options, n);
    const stream = new ReadableStream<LanguageModelV2StreamPart>({
      async start(controller) {
        controller.enqueue({ type: 'stream-start', warnings: [] });
        await sleep(DELAY);
        if ('text' in step) {
          const id = 'txt-0';
          controller.enqueue({ type: 'text-start', id });
          for (let i = 0; i < step.text.length; i += 16) {
            controller.enqueue({ type: 'text-delta', id, delta: step.text.slice(i, i + 16) });
            await sleep(DELAY / 20);
          }
          controller.enqueue({ type: 'text-end', id });
          controller.enqueue({ type: 'finish', finishReason: 'stop', usage: usage(Math.ceil(step.text.length / 4)) });
        } else {
          const tool = tools.find((t) => t.name === step.tool);
          const input = JSON.stringify(fitArgs(tool, step.args));
          controller.enqueue({ type: 'tool-call', toolCallId: crypto.randomUUID(), toolName: step.tool, input });
          controller.enqueue({ type: 'finish', finishReason: 'tool-calls', usage: usage(Math.ceil(input.length / 4)) });
        }
        controller.close();
      },
    });
    return { stream };
  }
}
