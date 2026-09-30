/* 榜单抓取层
 * 每个源独立失败、独立超时，一个挂了不影响其它源。
 * 抓的都是各平台公开的热榜接口，20 分钟内存缓存，不做高频轮询。
 * 接口是非官方的，随时可能变——所以 UI 会显示每个源的状态，并提供手动粘贴兜底。
 */

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const TIMEOUT = 12000;
const CACHE_TTL = 20 * 60 * 1000;
const PER_SOURCE = 20;

async function get(url, { headers = {}, method = 'GET', body } = {}) {
  const res = await fetch(url, {
    method,
    body,
    headers: { 'User-Agent': UA, 'Accept-Language': 'zh-CN,zh;q=0.9', ...headers },
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res;
}

const json = async (url, opts) => (await get(url, opts)).json();
const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

export const SOURCES = [
  {
    key: 'weibo',
    label: '微博热搜',
    kind: '社会热点',
    async fetch() {
      const data = await json('https://weibo.com/ajax/side/hotSearch', {
        headers: { Referer: 'https://weibo.com/' },
      });
      return (data?.data?.realtime || []).map((it) => ({
        title: clean(it.word || it.note),
        url: `https://s.weibo.com/weibo?q=${encodeURIComponent(`#${it.word}#`)}`,
        heat: Number(it.num) || null,
        tag: clean(it.label_name),
      }));
    },
  },
  {
    key: 'baidu',
    label: '百度热搜',
    kind: '社会热点',
    async fetch() {
      const html = await (await get('https://top.baidu.com/board?tab=realtime')).text();
      const m = html.match(/<!--s-data:([\s\S]*?)-->/);
      if (!m) throw new Error('页面结构变了，没找到数据块');
      const data = JSON.parse(m[1]);
      const card = (data?.data?.cards || [])[0];
      return (card?.content || []).map((it) => ({
        title: clean(it.query || it.word),
        url: it.rawUrl || it.appUrl || '',
        heat: Number(it.hotScore) || null,
        summary: clean(it.desc).slice(0, 200),
      }));
    },
  },
  {
    key: 'douyin',
    label: '抖音热榜',
    kind: '短视频',
    async fetch() {
      const data = await json('https://www.iesdouyin.com/web/api/v2/hotsearch/billboard/word/');
      return (data?.word_list || []).map((it) => ({
        title: clean(it.word),
        url: `https://www.douyin.com/search/${encodeURIComponent(it.word)}`,
        heat: Number(it.hot_value) || null,
      }));
    },
  },
  {
    key: 'toutiao',
    label: '今日头条',
    kind: '资讯',
    async fetch() {
      const data = await json('https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc');
      return (data?.data || []).map((it) => ({
        title: clean(it.Title),
        url: it.Url || '',
        heat: Number(it.HotValue) || null,
        tag: clean(it.Label),
      }));
    },
  },
  {
    key: 'kr36',
    label: '36氪热榜',
    kind: '科技商业',
    async fetch() {
      const data = await json('https://gateway.36kr.com/api/mis/nav/home/nav/rank/hot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partner_id: 'wap', param: { siteId: 1, platformId: 2 }, timestamp: 0 }),
      });
      return (data?.data?.hotRankList || []).map((it) => {
        const m = it.templateMaterial || {};
        return {
          title: clean(m.widgetTitle),
          url: `https://36kr.com/p/${it.itemId}`,
          heat: Number(m.statRead) || null,
          tag: clean(m.authorName),
        };
      });
    },
  },
  {
    key: 'bilibili',
    label: 'B 站排行',
    kind: '视频内容',
    async fetch() {
      const data = await json('https://api.bilibili.com/x/web-interface/ranking/v2?rid=0&type=all', {
        headers: { Referer: 'https://www.bilibili.com/' },
      });
      if (data?.code !== 0) throw new Error(`接口返回 code ${data?.code}（B 站常有风控限流）`);
      return (data?.data?.list || []).map((it) => ({
        title: clean(it.title),
        url: `https://www.bilibili.com/video/${it.bvid}`,
        heat: Number(it.stat?.view) || null,
        tag: clean(it.owner?.name),
      }));
    },
  },
];

/* ------------------------------------------------------------------ *
 * 不适合蹭的热点：代码层面直接过滤掉，不指望模型自觉
 * 提示词里也写了同样的红线，但实测模型会为了凑数越线，所以这里是硬闸门
 * ------------------------------------------------------------------ */
export const RISK_RULES = [
  { key: 'casualty', label: '伤亡灾难',
    re: /(死|亡故|身亡|遇难|殒命|丧生|失联|失踪|坠(机|楼|亡|海)|跳楼|轻生|自杀|窗沿|地震|台风|暴雨|洪水|山洪|泥石流|山火|火灾|爆炸|坍塌|车祸|事故|遇险|抢救|病危|重伤|殉职|去世|逝世|讣告|哀悼)/ },
  { key: 'crime', label: '犯罪司法',
    re: /(判处|判刑|获刑|无期|死缓|逮捕|被捕|落网|刑拘|拘留|嫌疑|涉嫌|诈骗|性侵|猥亵|强奸|家暴|虐待|涉毒|贩毒|受贿|贪污|落马|双开|通缉|案发|命案|凶手|遇害|黑产|非法|违法|卖淫|嫖|代孕)/ },
  { key: 'conflict', label: '战争政治冲突',
    re: /(轰炸|空袭|开战|战争|导弹|停火|交火|制裁|政变|示威|抗议游行|冲突升级|军事打击|难民)/ },
  { key: 'health', label: '疫病健康危机',
    re: /(疫情|确诊|感染者|病例|中毒|致癌|猝死|艾滋|传染)/ },
  { key: 'dispute', label: '点名到个人的争议',
    re: /(道歉|开撕|互撕|怒斥|痛斥|怒怼|喊话|叫板|回怼|封杀|塌房|翻车|开除|辞退|起诉|索赔|讨薪|举报|再曝|被曝)/ },
  { key: 'gossip', label: '明星私生活',
    re: /(恋情|分手|离婚|领证|出轨|绯闻|官宣|复合|怀孕|生子|产子|自曝|发长文|亲密照|同框|开房|情人|发生关系|喜提)/ },
];

export function riskOf(title) {
  const t = String(title || '');
  for (const rule of RISK_RULES) if (rule.re.test(t)) return rule;
  return null;
}

/* 交给模型之前先筛一遍；返回留下的和被挡掉的 */
export function screenItems(items) {
  const kept = [];
  const blocked = [];
  for (const it of items) {
    const risk = riskOf(it.title);
    if (risk) blocked.push({ ...it, risk: risk.label, riskKey: risk.key });
    else kept.push(it);
  }
  return { kept, blocked };
}

let cache = null;

/* 抓全部榜单：每个源独立成败，全挂了才算失败 */
export async function fetchBoards({ force = false } = {}) {
  if (!force && cache && Date.now() - cache.at < CACHE_TTL) return { ...cache, cached: true };

  const results = await Promise.all(SOURCES.map(async (src) => {
    try {
      const items = (await src.fetch())
        .filter((it) => it.title)
        .slice(0, PER_SOURCE)
        .map((it, i) => ({ ...it, rank: i + 1, source: src.key, platform: src.label, kind: src.kind }));
      if (!items.length) throw new Error('返回为空');
      return { key: src.key, label: src.label, kind: src.kind, ok: true, count: items.length, items };
    } catch (err) {
      return {
        key: src.key, label: src.label, kind: src.kind, ok: false, count: 0, items: [],
        error: err?.name === 'TimeoutError' ? '超时' : String(err?.message || err).slice(0, 80),
      };
    }
  }));

  const boards = {
    at: Date.now(),
    sources: results.map(({ items, ...rest }) => rest),
    items: results.flatMap((r) => r.items),
  };
  if (!boards.items.length) {
    const why = boards.sources.map((s) => `${s.label}：${s.error}`).join('；');
    throw new Error(`所有榜单源都没抓到内容（${why}）`);
  }
  cache = boards;
  return { ...boards, cached: false };
}

/* 手动兜底：用户自己粘一份榜单，一行一条 */
export function parseManual(text) {
  return String(text || '')
    .split('\n')
    .map((line) => clean(line).replace(/^\d+[.、)\s]+/, ''))
    .filter((t) => t.length >= 4 && t.length <= 120)
    .slice(0, 60)
    .map((title, i) => ({
      title, url: '', heat: null, rank: i + 1,
      source: 'manual', platform: '手动粘贴', kind: '自定义',
    }));
}

/* ------------------------------------------------------------------ *
 * 原文概要
 * 现实是：36氪、百家号、头条这些主流站点都有反爬或要 JS，正文基本抓不到。
 * 所以这里分三种来源，如实标注，绝不用模型脑补的"背景"冒充概要：
 *   board   榜单接口自带的摘要（百度热搜有）
 *   article 真抓到了原文正文，再交给模型压成概要
 *   none    只有标题——界面上直说，让用户自己点原文看
 * ------------------------------------------------------------------ */

const SEARCH_PAGE = /(^https?:\/\/(s\.weibo\.com|www\.baidu\.com\/s|www\.douyin\.com\/search))/;
const MIN_ARTICLE = 220;
const MAX_FETCH = 3;

function extractText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* 抓到的是不是真正文——反爬页、验证页都很短且有特征词 */
function looksLikeArticle(text) {
  if (text.length < MIN_ARTICLE) return false;
  return !/(安全检测|安全验证|网络不给力|需要允许该网站执行|请开启 ?JavaScript|访问验证|滑动验证)/.test(text.slice(0, 400));
}

export async function fetchArticle(url) {
  if (!url || SEARCH_PAGE.test(url)) return null;
  try {
    const res = await get(url, { headers: { Accept: 'text/html' } });
    const text = extractText(await res.text());
    return looksLikeArticle(text) ? text.slice(0, 6000) : null;
  } catch {
    return null;
  }
}

/* 给命中的几条热点补概要；summarize 由调用方注入（避免这层依赖 llm.js） */
export async function enrichSummaries(items, summarize) {
  let budget = MAX_FETCH;

  return Promise.all(items.map(async (it) => {
    const own = String(it.summary || '').trim();
    if (own.length >= 40) {
      return { ...it, summary: own.slice(0, 400), summarySource: 'board' };
    }
    if (budget <= 0) return { ...it, summary: '', summarySource: 'none' };
    budget -= 1;

    const body = await fetchArticle(it.url);
    if (!body) return { ...it, summary: '', summarySource: 'none' };
    try {
      const digest = (await summarize(it.title, body) || '').trim();
      return digest
        ? { ...it, summary: digest.slice(0, 400), summarySource: 'article' }
        : { ...it, summary: '', summarySource: 'none' };
    } catch {
      return { ...it, summary: '', summarySource: 'none' };
    }
  }));
}

/* ---------- 用户自定义热点：关键词搜新闻（智谱 web_search）----------
 * 和 GLM 聊天通道共用一把 key（LLM_GLM_API_KEY，也可单独给 ZHIPU_API_KEY）。
 * 10 分钟按词缓存，防连点重复计费；接口失败原样抛错，UI 显示原因。
 */
const searchCache = new Map();

export async function searchNews(q) {
  const hit = searchCache.get(q);
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.items;

  // 智谱的 key 全接口通用——web_search 用的就是 GLM 聊天那把，不用单独申请
  const key = process.env.LLM_GLM_API_KEY || process.env.ZHIPU_API_KEY;
  if (!key) throw new Error('未配置智谱 key（.env 里的 LLM_GLM_API_KEY）');

  const r = await fetch('https://open.bigmodel.cn/api/paas/v4/web_search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ search_engine: 'search_std', search_query: q, count: 12 }),
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!r.ok) throw new Error(`智谱搜索接口 ${r.status}`);
  const d = await r.json().catch(() => ({}));
  if (d.error) throw new Error(typeof d.error === 'string' ? d.error : '搜索接口返回错误');
  const rows = d.search_result || (d.data && d.data.search_result) || [];
  // search_result 的 content 是网页正文、不是摘要：截前 300 字当参考就够了，
  // 全塞进去会把后面汇总那步的提示词撑爆
  const items = rows
    .map((x) => ({
      title: clean(x.title),
      url: x.link || x.url || '',
      summary: clean(x.content || x.snippet).slice(0, 300),
      platform: '关键词搜索',
      summarySource: 'search',
      heat: null,
      at: Date.now(),
    }))
    .filter((it) => it.title);

  if (!items.length) throw new Error('没搜到相关新闻，换个词试试');
  searchCache.set(q, { at: Date.now(), items });
  return items;
}
