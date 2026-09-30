import { assertQuota, consume } from './quota.js';
/* 大模型接入层
 *   chain（默认）—— 通道链：一组 Anthropic 协议端点逐个兜底，谁可用谁服务
 *                 anthropic —— 官方 API（配了 ANTHROPIC_API_KEY 才进链）
 *                 kimi / mimo / glm / deepseek —— 各家 Anthropic 兼容端点
 *   openai       —— 任意 OpenAI 兼容接口（DeepSeek / Kimi / 通义 / vLLM / Ollama）
 *   mock         —— 无密钥时的本地模板，保证系统开箱可跑通全流程
 */
import Anthropic from '@anthropic-ai/sdk';

const OPENAI_MODEL = process.env.OPENAI_MODEL || 'deepseek-chat';
const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL || 'https://api.deepseek.com/v1').replace(/\/$/, '');
const OPENAI_KEY = process.env.OPENAI_API_KEY || process.env.LLM_API_KEY || '';

/* ── 通道链 ────────────────────────────────────────────────
 * 全部走 Anthropic 协议，x-api-key 认证。顺序即优先级，
 * 没配 key 的通道自动跳过；LLM_CHAIN 可重排。
 * 官方通道只认 ANTHROPIC_API_KEY，不认 ANTHROPIC_AUTH_TOKEN——
 * 后者常是本机 Claude Code 代理的变量，误接进来会打到代理上。 */
const CHAIN_DEFS = {
  anthropic: {
    label: 'Claude', official: true,
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    baseURL: process.env.ANTHROPIC_BASE_URL,
    model: process.env.ANTHROPIC_MODEL || 'claude-opus-5-5',
  },
  kimi: {
    label: 'Kimi',
    apiKey: process.env.LLM_KIMI_API_KEY || '',
    baseURL: process.env.LLM_KIMI_BASE_URL,
    model: process.env.LLM_KIMI_MODEL || 'kimi-k2.5',
  },
  mimo: {
    label: 'MiMo',
    apiKey: process.env.LLM_MIMO_API_KEY || '',
    baseURL: process.env.LLM_MIMO_BASE_URL,
    model: process.env.LLM_MIMO_MODEL || 'mimo-v2.5',
  },
  glm: {
    label: 'GLM',
    apiKey: process.env.LLM_GLM_API_KEY || '',
    baseURL: process.env.LLM_GLM_BASE_URL,
    model: process.env.LLM_GLM_MODEL || 'glm-5.3',
  },
  deepseek: {
    label: 'DeepSeek',
    apiKey: process.env.LLM_DEEPSEEK_API_KEY || '',
    baseURL: process.env.LLM_DEEPSEEK_BASE_URL,
    model: process.env.LLM_DEEPSEEK_MODEL || 'deepseek-v4-flash',
  },
};

const FORCED = (process.env.LLM_PROVIDER || '').trim().toLowerCase();

function buildChain() {
  // LLM_PROVIDER=anthropic 锁死官方通道：没有 key 时到调用点才报错，和通道链区分开
  if (FORCED === 'anthropic') return [{ name: 'anthropic', ...CHAIN_DEFS.anthropic }];
  const order = (process.env.LLM_CHAIN || 'anthropic,kimi,mimo,glm,deepseek')
    .split(',').map((s) => s.trim()).filter(Boolean);
  return order
    .map((name) => CHAIN_DEFS[name] && { name, ...CHAIN_DEFS[name] })
    .filter(Boolean)
    .filter((ch) => ch.apiKey);
}

const CHAIN = buildChain();

function detectProvider() {
  if (FORCED === 'mock' || FORCED === 'openai') return FORCED;
  if (FORCED === 'anthropic' || CHAIN.length) return 'chain';
  if (OPENAI_KEY) return 'openai';
  return 'mock';
}

export const PROVIDER = detectProvider();

export function providerInfo() {
  if (PROVIDER === 'chain') {
    const [first, ...rest] = CHAIN;
    // label 只放主通道名；兜底链单独放 fallbacks，由启动横幅 / 前端角标各自排版
    return { provider: 'chain', model: first.model, label: first.label, fallbacks: rest.map((c) => c.label), live: true };
  }
  if (PROVIDER === 'openai') return { provider: 'openai', model: OPENAI_MODEL, label: 'OpenAI 兼容接口', fallbacks: [], live: true };
  return { provider: 'mock', model: '本地模板', label: '演示模式（未配置密钥）', fallbacks: [], live: false };
}

const _clients = new Map();
function clientOf(ch) {
  if (!_clients.has(ch)) {
    /* authToken 显式置 null：不置的话 SDK 会从环境里读 ANTHROPIC_AUTH_TOKEN，
       把本机 Claude Code 代理的 token 随每个请求一起发出去。部分兼容端点
       先验 Authorization 再验 x-api-key，会被这个外来 token 顶成 401。 */
    _clients.set(ch, new Anthropic({ apiKey: ch.apiKey || undefined, baseURL: ch.baseURL || undefined, authToken: null }));
  }
  return _clients.get(ch);
}

/* 采样参数：1.3 实测在中文长文里会跑出语无伦次的句子，降到 1.0（DeepSeek 的默认值）稳很多。
 * 语气由账号设定和语气档案负责，不靠高温度堆"创意"。可用环境变量微调。
 * 官方 Claude 已移除 temperature/top_p（发送会 400），只在兼容通道上带。 */
const TEMP_PROSE = Number(process.env.LLM_TEMPERATURE) || 1.0;
const TEMP_JSON = Number(process.env.LLM_TEMPERATURE_JSON) || 0.6;
const TOP_P = Number(process.env.LLM_TOP_P) || 0.95;

/* ------------------------------------------------------------------ *
 * 用量埋点：由 index.js 注入落库函数，这一层不直接依赖 db
 * ------------------------------------------------------------------ */
let usageSink = null;
export const setUsageSink = (fn) => { usageSink = fn; };

/* 配额在这里统一拦，不在十几个调用点各写一遍——那样一定会漏一个。
   eval 跑批不占用户额度（它是后台行为，成本记在管理员头上）。 */
async function tracked(meta, run) {
  const started = Date.now();
  const metered = meta.userId && !String(meta.feature || '').startsWith('eval');
  if (metered) assertQuota(meta.userId, '文案');
  try {
    const { value, usage, channel, model } = await run();
    const tokens = (usage?.input || 0) + (usage?.output || 0);
    usageSink?.({
      ...meta, provider: channel || PROVIDER, model: model || 'mock', ok: true, ms: Date.now() - started,
      inputTokens: usage?.input || 0, outputTokens: usage?.output || 0,
      units: tokens, unit: 'token',
    });
    if (metered) consume(meta.userId, '文案', tokens);
    return value;
  } catch (err) {
    usageSink?.({
      ...meta, provider: PROVIDER, model: CHAIN.map((c) => c.label).join('→') || PROVIDER, ok: false, ms: Date.now() - started,
      error: String(err?.message || err),
    });
    throw err;
  }
}

/* ------------------------------------------------------------------ *
 * 兜底执行：沿通道链逐个试，谁先成功用谁的结果
 * 客户端主动取消不换通道；流式已经吐过字也不换——换了客户端会收到
 * 两截拼起来的半成品，不如报错重生成。
 * ------------------------------------------------------------------ */
async function runChain(run) {
  const errors = [];
  for (const ch of CHAIN) {
    try {
      const out = await run(ch);
      return { ...out, channel: ch.name, model: ch.model };
    } catch (err) {
      if (err?.name === 'AbortError' || err?.noRetry) throw err;
      errors.push(`${ch.label}：${String(err?.message || err).slice(0, 120)}`);
    }
  }
  throw new Error(`所有模型通道都失败了。${errors.join('；')}`);
}

/* Anthropic 协议的用量字段换成统一的 input/output */
const pick = (u) => ({ input: u?.input_tokens, output: u?.output_tokens });

/* ------------------------------------------------------------------ *
 * 结构化生成：返回符合 schema 的对象
 * ------------------------------------------------------------------ */
export async function generateJSON({ system, user, schema, mock, meta = {} }) {
  return tracked({ feature: 'unknown', ...meta }, async () => {
    if (PROVIDER === 'mock') return { value: mock(), usage: null };

    if (PROVIDER === 'openai') {
      const res = await openaiChat({
        system,
        user: `${user}\n\n只输出一个 JSON 对象，不要任何解释或代码块标记。JSON Schema：\n${JSON.stringify(schema)}`,
        stream: false,
        temperature: TEMP_JSON,    // 结构化输出用低温度，减少格式跑偏
        responseFormat: { type: 'json_object' },
      });
      return { value: parseJSON(res.text), usage: res.usage };
    }

    return runChain(async (ch) => {
      /* 官方通道走 API 原生结构化输出；兼容端点不一定实现 output_config，
         统一改成把 schema 写进提示词，靠 parseJSON 兜住格式。 */
      if (ch.official) {
        const res = await clientOf(ch).messages.create({
          model: ch.model,
          max_tokens: 16000,
          system,
          messages: [{ role: 'user', content: user }],
          output_config: { format: { type: 'json_schema', schema }, effort: 'medium' },
        });
        const text = res.content.find((b) => b.type === 'text')?.text || '';
        return { value: parseJSON(text), usage: pick(res.usage) };
      }
      const res = await clientOf(ch).messages.create({
        model: ch.model,
        max_tokens: 16000,
        system,
        messages: [{ role: 'user', content: `${user}\n\n只输出一个 JSON 对象，不要任何解释或代码块标记。JSON Schema：\n${JSON.stringify(schema)}` }],
        temperature: TEMP_JSON,
        top_p: TOP_P,
      });
      const text = res.content.find((b) => b.type === 'text')?.text || '';
      return { value: parseJSON(text), usage: pick(res.usage) };
    });
  });
}

/* ------------------------------------------------------------------ *
 * 一次性文本生成（不流式）：用于语气档案这类短输出
 * ------------------------------------------------------------------ */
export async function generateText({ system, user, mock, meta = {} }) {
  return tracked({ feature: 'unknown', ...meta }, async () => {
    if (PROVIDER === 'mock') return { value: mock(), usage: null };

    if (PROVIDER === 'openai') {
      const res = await openaiChat({ system, user, stream: false });
      return { value: res.text, usage: res.usage };
    }

    return runChain(async (ch) => {
      const res = await clientOf(ch).messages.create({
        model: ch.model,
        max_tokens: 4000,
        system,
        messages: [{ role: 'user', content: user }],
        ...(ch.official ? { output_config: { effort: 'medium' } } : { temperature: TEMP_PROSE, top_p: TOP_P }),
      });
      return {
        value: res.content.filter((b) => b.type === 'text').map((b) => b.text).join(''),
        usage: pick(res.usage),
      };
    });
  });
}

/* ------------------------------------------------------------------ *
 * 流式正文：逐段回调 onDelta，返回完整文本
 * ------------------------------------------------------------------ */
export async function streamText({ system, user, onDelta, mock, signal, meta = {} }) {
  return tracked({ feature: 'unknown', ...meta }, () => streamOnce({ system, user, onDelta, mock, signal }));
}

async function streamOnce({ system, user, onDelta, mock, signal }) {
  if (PROVIDER === 'mock') return { value: await streamMock(mock(), onDelta, signal), usage: null };

  if (PROVIDER === 'openai') {
    const res = await openaiChat({ system, user, stream: true, onDelta, signal });
    return { value: res.text, usage: res.usage };
  }

  return runChain(async (ch) => {
    const stream = clientOf(ch).messages.stream(
      {
        model: ch.model,
        max_tokens: 16000,
        system,
        messages: [{ role: 'user', content: user }],
        ...(ch.official ? { output_config: { effort: 'medium' } } : { temperature: TEMP_PROSE, top_p: TOP_P }),
      },
      { signal },
    );
    let full = '';
    try {
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          full += event.delta.text;
          onDelta(event.delta.text);
        }
      }
    } catch (err) {
      if (full) err.noRetry = true;   // 已经吐过字，换通道会给客户端拼出两截
      throw err;
    }
    const final = await stream.finalMessage();
    if (final.stop_reason === 'refusal') {
      throw new Error(`模型拒绝了该请求（${final.stop_details?.category || '未说明原因'}）`);
    }
    return { value: full, usage: pick(final.usage) };
  });
}

/* ------------------------------------------------------------------ *
 * OpenAI 兼容协议
 * ------------------------------------------------------------------ */
async function openaiChat({ system, user, stream, onDelta, responseFormat, signal, temperature = TEMP_PROSE }) {
  const res = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      ...(OPENAI_KEY ? { Authorization: `Bearer ${OPENAI_KEY}` } : {}),
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      stream: Boolean(stream),
      temperature,
      top_p: TOP_P,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      ...(stream ? { stream_options: { include_usage: true } } : {}),
      ...(responseFormat ? { response_format: responseFormat } : {}),
    }),
  });

  if (!res.ok) {
    throw new Error(`上游接口返回 ${res.status}：${(await res.text()).slice(0, 300)}`);
  }

  if (!stream) {
    const data = await res.json();
    return {
      text: data.choices?.[0]?.message?.content || '',
      usage: { input: data.usage?.prompt_tokens, output: data.usage?.completion_tokens },
    };
  }

  let full = '';
  let buf = '';
  let usage = null;
  const decoder = new TextDecoder();
  for await (const chunk of res.body) {
    buf += decoder.decode(chunk, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() || '';
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const chunk = JSON.parse(payload);
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) { full += delta; onDelta?.(delta); }
        // 开了 include_usage 之后，用量在最后一个 chunk 里
        if (chunk.usage) usage = { input: chunk.usage.prompt_tokens, output: chunk.usage.completion_tokens };
      } catch { /* 忽略心跳等非 JSON 行 */ }
    }
  }
  return { text: full, usage };
}

/* ------------------------------------------------------------------ *
 * 工具
 * ------------------------------------------------------------------ */
export function parseJSON(text) {
  const cleaned = String(text).replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').trim();
  try { return JSON.parse(cleaned); } catch { /* 继续尝试截取 */ }
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { /* fallthrough */ }
  }
  throw new Error('模型没有返回可解析的 JSON');
}

async function streamMock(text, onDelta, signal) {
  for (let i = 0; i < text.length; i += 12) {
    if (signal?.aborted) break;
    onDelta(text.slice(i, i + 12));
    await new Promise((r) => setTimeout(r, 18));
  }
  return text;
}
