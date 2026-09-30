/* 平台/风格预设与提示词构造 —— 系统的“产品知识”都集中在这里 */

export const PLATFORMS = {
  xiaohongshu: {
    label: '小红书',
    length: 600,
    spec: `小红书笔记。标题 20 字以内、带情绪钩子，可用 1-2 个 emoji；正文短句分段，每段 1-3 行，多用「我」的第一人称经验；
中间穿插小标题或序号清单；结尾给一句行动号召 + 3-6 个 #话题标签。忌书面腔、忌大段说理。`,
  },
  gongzhonghao: {
    label: '微信公众号',
    length: 1400,
    spec: `公众号推文。标题克制但有信息量；开头用一个具体场景或反常识结论抓住读者；正文用 3-5 个带小标题的章节推进论证，
每节有观点 + 例证 + 一句可摘抄的金句；结尾收束到读者可执行的建议。段落之间留白，语气像和读者聊天但有干货密度。`,
  },
  zhihu: {
    label: '知乎',
    length: 1500,
    spec: `知乎回答。开门见山给结论，再拆解「为什么」；讲逻辑、给数据或案例、承认边界与例外；
可用分点、对比、机制拆解；语气克制专业，不喊口号，不堆形容词。结尾一句提炼。`,
  },
  douyin: {
    label: '抖音口播脚本',
    length: 700,
    spec: `短视频口播脚本，成片 60-90 秒。结构：0-3 秒强钩子（一句反常识或痛点直击）→ 快速给出结论 →
2-3 个论证/步骤，每段口语短句 →  结尾引导互动。用【口播】【画面】【字幕】分栏标注，句子必须能顺口念出来。`,
  },
  weibo: {
    label: '微博',
    length: 300,
    spec: `微博长文/短博。开头一句立住观点，全文口语、节奏快、有态度；控制在 300 字内；
结尾带 2-4 个 #话题#。可用换行制造停顿感。`,
  },
  bilibili: {
    label: 'B 站视频文案',
    length: 1200,
    spec: `B 站中视频脚本。标题带信息增量和好奇缺口；结构：开场悬念 → 背景铺垫 → 分段主体（每段一个小标题+口播）→ 总结与互动引导。
语气年轻、有梗但不油，可标注【转场】【画面提示】。`,
  },
};

export const TONES = {
  实用干货: '信息密度高，能落地，多给方法、步骤、清单和可验证的细节。',
  真诚共情: '第一人称讲述真实感受与细节，先共情再给建议，不说教。',
  犀利观点: '立场鲜明，敢下判断，用对比和反问推进，但论据扎实、不情绪化。',
  轻松幽默: '口语化，有网感和自嘲，节奏轻快，笑点服务于观点而不是喧宾夺主。',
  专业权威: '术语准确，引用机制、数据或行业惯例，语气冷静，结论有边界条件。',
  故事叙事: '用一个具体的人、一段完整的事推进，有场景、转折和落点，道理藏在故事里。',
};

export const DEFAULT_PLATFORM = 'xiaohongshu';
export const DEFAULT_TONE = '实用干货';

export const platformSpec = (key) => (PLATFORMS[key] || PLATFORMS[DEFAULT_PLATFORM]);
export const toneSpec = (key) => TONES[key] || TONES[DEFAULT_TONE];

/* 三个方向的 JSON 结构 —— Anthropic 走 output_config.format，其它渠道走提示词约束 */
export const TOPICS_SCHEMA = {
  type: 'object',
  properties: {
    topics: {
      type: 'array',
      minItems: 3,
      maxItems: 3,
      items: {
        type: 'object',
        properties: {
          label: {
            type: 'string',
            description: '给这个方向定性的短标签，2-6 个字，如「个人经历」「方法拆解」「反常识」「对比测评」「行业视角」。'
              + '三个方向的标签必须互不相同，且要能一眼看出差异在哪个维度上',
          },
          title: { type: 'string', description: '可直接使用的标题，符合平台调性' },
          angle: { type: 'string', description: '这个方向的切入角度，一句话说清和另外两个的区别。要具体到"它写什么、另外两个不写什么"' },
          hook: { type: 'string', description: '开篇钩子，一到两句' },
          outline: {
            type: 'array', minItems: 3, maxItems: 5,
            items: { type: 'string' },
            description: '3-5 条内容骨架，每条一个要点',
          },
          audience_fit: { type: 'string', description: '最适合打动谁、为什么' },
        },
        required: ['label', 'title', 'angle', 'hook', 'outline', 'audience_fit'],
        additionalProperties: false,
      },
    },
  },
  required: ['topics'],
  additionalProperties: false,
};

export const GENDERS = ['男', '女', '其他'];

/* 个人人设块：博主本人的情况，决定第一人称的口吻与取材 */
const creatorBlock = (a) => {
  if (!a) return null;
  const age = String(a.creator_age || '').trim();
  const lines = [
    age ? `年龄：${/^\d+$/.test(age) ? `${age} 岁` : age}` : null,
    a.creator_gender ? `性别：${a.creator_gender}` : null,
    a.creator_industry ? `所在行业：${a.creator_industry}` : null,
    a.creator_role ? `岗位：${a.creator_role}` : null,
    a.creator_traits ? `性格特征：${a.creator_traits}` : null,
  ].filter(Boolean);
  if (!lines.length) return null;

  return `—— 博主本人（第一人称就是这个人）——
${lines.join('\n')}

行文以这个人的身份展开：自称与生活处境要符合其年龄阶段，举例和类比优先取自其行业与岗位的真实工作场景，
语气节奏贴合其性格特征。不要点名罗列这些设定，要让它自然体现在选材、措辞和态度里；
也不要虚构与这份人设明显冲突的经历（如岗位对不上的专业细节、年龄段不符的生活状态）。`;
};

/* 账号设定块：所有创作都以它为语境前提 */
const personaBlock = (a) => {
  if (!a) return null;
  const lines = [
    `账号名称：${a.name}`,
    a.content_focus ? `内容定位（主要写什么）：${a.content_focus}` : null,
    a.audience ? `账号目标用户：${a.audience}` : null,
    a.problem ? `账号为读者解决的问题：${a.problem}` : null,
    a.notes ? `其它要求与禁忌：${a.notes}` : null,
  ].filter(Boolean);
  return `—— 账号设定 ——\n${lines.join('\n')}\n\n本次创作必须落在这个账号的定位之内：服务它的目标用户、回应它要解决的问题、延续它一贯的语气；不要写成任何账号都能发的通用内容。`;
};

const brief = (d, persona, samples) => {
  const p = platformSpec(d.platform);
  const account = personaBlock(persona);
  const creator = creatorBlock(persona);
  const style = styleBlock(persona, samples);
  const section = sectionBlock(d.section, d.inputs);
  const hot = hotspotRefBlock(d.hotspot);
  const head = [account, creator, style, section].filter(Boolean);
  return [
    head.join('\n\n') || null,
    hot ? `\n${hot}` : null,
    head.length || hot ? '\n—— 本篇简报 ——' : null,
    `题材：${d.subject}`,
    `发布平台：${p.label}`,
    `风格调性：${d.tone} —— ${toneSpec(d.tone)}`,
    // 和账号目标用户一字不差时不再重复一遍；不同才说明是本篇的收窄
    d.audience && d.audience !== persona?.audience
      ? `本篇聚焦读者：${d.audience}`
      : (persona?.audience ? null : '目标读者：由你根据题材判断'),
    d.keywords ? `必须覆盖的关键词/信息点：${d.keywords}` : null,
    `目标篇幅：约 ${d.length} 字`,
    `\n平台写作规范：\n${p.spec}`,
  ].filter((x) => x != null).join('\n');
};

export const TOPICS_SYSTEM =
`你是一位资深自媒体主编，擅长把一个宽泛题材拆成几个真正不同的选题方向。
要求：
1. 三个方向必须在「切入角度」上互相错开——比如个人经历 / 方法拆解 / 反常识观点 / 对比测评 / 行业视角，不要只是换标题措辞。
   **label 就是这个差异维度的名字**，2-6 字，三个必须互不相同。
   **angle 要说清"它写什么、另外两个不写什么"**——读者是靠这一句来选的，写成套话等于三个方向没区别。
2. 标题写成可以直接发布的样子，符合目标平台的语感，不要出现「方向一」这类元描述。
3. 钩子要具体：给出场景、数字、冲突或反差，禁止「你知道吗」「今天教大家」这类套话。
4. 骨架每条都是能写成一段的实质要点，不是空泛的小标题。
5. 若给出了账号设定，三个方向都必须服务于该账号的定位与它要解决的问题——差异体现在切入角度上，而不是跑到账号定位之外去。
   若给出了博主本人的人设，优先选那些他凭自身年龄、行业、岗位和性格真的写得出来、别人写不出来的角度。
6. 若指定了栏目，三个方向都必须是这个栏目该有的样子——比如「来时路」就该讲来历和差异，不要写成干货教程。
7. 全部使用简体中文。`;

export const topicsUser = (d, persona, samples) =>
`请基于下面这份创作简报，给出 3 个差异化的选题方向。

${brief(d, persona, samples)}`;

export const CONTENT_SYSTEM =
`你是一位一线自媒体写手，为指定平台产出可直接发布的成稿。
要求：
1. 严格遵守平台写作规范与风格调性，语感自然，像人写的，不像模板填空。
2. 内容要有具体信息：真实的场景、可执行的步骤、可感的细节。宁可写深一个点，也不要样样浅尝。
3. 不要出现「作为一个 AI」「以下是」这类元话语，不要写解释性前言，直接从成稿开始。
4. 不确定的事实用可核查的表述方式（如「据公开报道」）或改写成经验性表达，绝不编造具体数据、机构名或引语。
5. 若给出了账号设定，全文的立场、称呼、举例和知识密度都要贴合该账号的目标用户，并遵守其中列出的要求与禁忌。
   若还给出了博主本人的人设，第一人称就是这个人——他的年龄、行业、岗位和性格要落在具体的措辞与例子里，而不是被直白地写出来。
6. 输出 Markdown：第一行是 # 标题，正文分段；口播类脚本按规范分栏标注。
7. 全部使用简体中文。`;

export const contentUser = (d, topic, persona, samples, materials = []) =>
`按下面选定的方向写出完整成稿。

${brief(d, persona, samples)}
${materialsBlock(materials) ? `\n${materialsBlock(materials)}\n` : ''}

—— 选定方向 ——
标题：${topic.title}
切入角度：${topic.angle}
开篇钩子：${topic.hook}
适配读者：${topic.audience_fit || ''}
内容骨架：
${(topic.outline || []).map((s, i) => `${i + 1}. ${s}`).join('\n')}

请沿用这个方向和骨架展开，可以在骨架基础上补充细节和过渡，但不要改变核心角度。`;

/* ==================================================================
 * 语气学习：用户确认后喂进来的成稿 → 蒸馏成语气档案 → 回灌到后续创作
 * ================================================================== */

export const DIGEST_SYSTEM =
`你是一位文字风格分析师。给你同一个博主的几篇成稿，你要总结出他**可复制的写作习惯**，
让另一个人照着写也能像他。要求：
1. 只写观察得到的、可执行的特征，不要评价好坏，不要复述文章内容。
2. 覆盖这几方面：句子长度与句式、段落节奏与排版、开头习惯、结尾习惯、
   高频词与口头禅、比喻和举例的取材偏好、标点与emoji用法、明显回避的表达。
3. 每条一行，用「- 」开头，具体到可以照做（例：「- 段落多为 1-3 行，几乎不写超过 5 行的长段」
   优于「- 段落简洁」）。总共 8-14 条。
4. 若某方面样本里看不出稳定规律，就不要写，不要硬凑。
5. 全部使用简体中文，直接输出条目，不要标题和前言。`;

export const digestUser = (samples) =>
`以下是同一个博主的 ${samples.length} 篇成稿，请总结他的写作习惯。

${samples.map((s, i) => `===== 样本 ${i + 1}${s.title ? `：${s.title}` : ''} =====\n${s.content}`).join('\n\n')}`;

/* 注入创作提示词的语气块：档案为主，附少量片段做语感锚点 */
const styleBlock = (persona, samples = []) => {
  const digest = String(persona?.style_digest || '').trim();
  if (!digest) return null;

  const excerpts = samples.slice(0, 2)
    .map((s, i) => `${i + 1}. ${s.content.slice(0, 220).replace(/\n+/g, ' ')}……`)
    .join('\n');

  return `—— 这个号的语气档案（从博主确认过的历史稿件里学到的）——
${digest}
${excerpts ? `\n历史片段（只模仿语感，不要复用其中的内容和例子）：\n${excerpts}` : ''}
写作时优先服从这份语气档案：它比通用的风格调性更能代表这个号真实的样子。`;
};

/* ==================================================================
 * 编辑器里的 AI：划词改写 与 / 唤起续写
 * ================================================================== */

export const ASSIST_ACTIONS = {
  expand:       { label: '扩写',         mode: 'replace', instruction: '把选中这段扩写得更充实：补上具体细节、场景、步骤或数据支撑，长度约为原来的 2 倍。不要注水式重复，也不要改变原意。' },
  professional: { label: '专业点',       mode: 'replace', instruction: '把选中这段改得更专业：用词准确，给出机制、依据或行业惯例，去掉口水话和空泛形容词。长度不要明显增加。' },
  casual:       { label: '轻松点',       mode: 'replace', instruction: '把选中这段改得更轻松口语：拆成短句，有节奏，像跟朋友说话，可以带一点自嘲或网感，但不要油腻、不要硬凑梗。长度不要明显增加。' },
  shorten:      { label: '缩写',         mode: 'replace', instruction: '把选中这段压缩到原来的四到六成，只保留信息量最高的部分。要仍然是通顺的段落，不要变成提纲。' },
  example:      { label: '举个例子',     mode: 'append',  instruction: '为选中这段补一个具体的例子：有场景、有细节、能让人立刻对上号。只输出这个例子本身（一到两段），不要重复原文，不要写「例如」以外的引导语堆砌。不要编造具体数据、机构名或他人引语。' },
  simplify:     { label: '更好懂',       mode: 'replace', instruction: '把选中这段改写得更容易理解：拆开长句，把抽象说法换成具体的，必要时打一个贴切的比方。信息不能丢，长度可以略增。' },
};

export const COMPOSE_ACTIONS = {
  continue: { label: '续写这一段', instruction: '顺着光标前面的内容往下写一到两段，自然衔接，不要重复已有内容。' },
  heading:  { label: '加个小标题', instruction: '为光标后面的内容写一个小标题。只输出标题本身（含 Markdown 的 ## 前缀），不要写正文。' },
  ending:   { label: '写个结尾',   instruction: '为这篇稿子写一个结尾段：收束全文，落到读者可执行的一步或一句有余味的话，并符合该平台的收尾习惯。' },
  opening:  { label: '写个开头',   instruction: '为这篇稿子写一个开篇：用具体场景、反常识结论或直击痛点的一句话抓住读者，两到四行。' },
};

export const ASSIST_SYSTEM =
`你是这位博主的文字助手，在他的编辑器里就地改写或续写。铁律：
1. **只输出正文本身**——不要解释、不要前言后语、不要加引号或代码块标记。
2. 你的输出会**逐字替换掉选中的那一段**，所以边界必须严格对齐：
   - 绝不能把上文或下文里已经存在的内容（尤其是小标题）抄进输出；
   - 选区是半句话就还它半句话，选区是一段就还它一段——**输出的粒度和体量跟着选区走**；
   - 不要顺手改写选区之外的内容，哪怕你觉得那里写得不好。
3. 输出要和上下文严丝合缝：承接上文的话题与人称，不与下文重复。
4. 保持这个账号和这位博主一贯的语气；给了语气档案就优先服从它。
5. 不编造具体数据、机构名、他人引语；不确定的事实改成经验性表达。
6. 除非另有要求，输出 Markdown 正文片段，使用简体中文。`;

const contextBlock = (d, persona, samples) => [
  personaBlock(persona),
  creatorBlock(persona),
  styleBlock(persona, samples),
  `—— 这篇稿子 ——\n题材：${d.subject}\n发布平台：${platformSpec(d.platform).label}\n风格调性：${d.tone}${d.title ? `\n标题：${d.title}` : ''}`,
  `平台写作规范：\n${platformSpec(d.platform).spec}`,
].filter(Boolean).join('\n\n');

/* 划词改写 */
export const assistUser = (d, persona, samples, { instruction, selection, before, after }) =>
`${contextBlock(d, persona, samples)}

—— 选中的这段 ——
${selection}

—— 它上文的结尾 ——
${before || '（这段就在文章开头）'}

—— 它下文的开头 ——
${after || '（这段就在文章结尾）'}

—— 你要做的 ——
${instruction}
${selection.length < 40 ? `\n注意：选区只有 ${selection.length} 个字，是一个片段而不是完整段落。输出也必须是同一量级的片段，不要扩展成整段或整节。` : ''}`;

/* / 唤起的就地续写 */
export const composeUser = (d, persona, samples, { instruction, before, after }) =>
`${contextBlock(d, persona, samples)}

—— 光标前面已经写好的内容 ——
${before || '（光标在文章最开头）'}

—— 光标后面已有的内容 ——
${after || '（光标在文章最末尾）'}

—— 你要做的 ——
${instruction}`;

/* ==================================================================
 * 题材推荐：进入创作简报时默认给三条这个号还没写过的题材
 * ================================================================== */

export const SUBJECTS_SCHEMA = {
  type: 'object',
  properties: {
    ideas: {
      type: 'array', minItems: 3, maxItems: 3,
      items: {
        type: 'object',
        properties: {
          subject: { type: 'string', description: '一句话的题材，就是「这篇写什么」，15-30 字，不是标题' },
          reason: { type: 'string', description: '一句话说明为什么这个号现在适合写它，20 字以内' },
        },
        required: ['subject', 'reason'],
        additionalProperties: false,
      },
    },
  },
  required: ['ideas'],
  additionalProperties: false,
};

export const SUBJECTS_SYSTEM =
`你是这个自媒体账号的选题策划。给你账号的定位和它已经写过的东西，你要提出三条**还没写过的新题材**。
要求：
1. 「题材」是「这篇写什么」的范围，不是标题——别写成带钩子的标题党句子，也别写成空泛的大词（如「聊聊效率」）。
2. 三条必须落在账号定位之内：服务它的目标用户、回应它要解决的问题；同时三条之间在**内容主题**上要明显错开，
   不要是同一件事的三种说法（切入角度的差异是下一步的事，这里要的是三个不同的题目）。
3. **严格避开已写过的清单**：不只是字面不同，实质主题重合的也不行；某个题材只是"换个说法"重提旧事，就换一个。
4. 优先挑这个号真的写得出来的：能用到博主本人的行业、岗位、生活处境的，比泛泛的通用话题好。
5. 每条配一句话理由，说人话，别写"能引发共鸣"这类套话。
6. 全部使用简体中文。`;

export const subjectsUser = (persona, used = []) => {
  const head = [personaBlock(persona), creatorBlock(persona)].filter(Boolean).join('\n\n');
  const history = used.length
    ? used.map((u, i) => `${i + 1}. ${u.subject}${u.title && u.title !== u.subject ? `（成稿标题：${u.title}）` : ''}`).join('\n')
    : '（这个号还没写过任何内容）';

  return `${head}

—— 这个号已经写过的（务必避开）——
${history}

请给出 3 条这个号还没写过的新题材。`;
};

/* ==================================================================
 * 热点比对：把榜单和账号定位放一起，挑出真能蹭的
 * ================================================================== */

export const HOTSPOT_SCHEMA = {
  type: 'object',
  properties: {
    matches: {
      type: 'array', minItems: 0, maxItems: 5,
      items: {
        type: 'object',
        properties: {
          index: { type: 'integer', description: '榜单列表里的编号，必须原样引用' },
          source_title: { type: 'string', description: '该条热点的原标题，逐字照抄' },
          angle: { type: 'string', description: '蹭热点的点：这条热点和这个账号之间的那座桥，一到两句说清' },
          subject: { type: 'string', description: '选题建议：一句可以直接开写的题材，15-30 字' },
          strength: { type: 'string', enum: ['强', '中', '弱'], description: '关联强度' },
          caution: { type: 'string', description: '需要注意的分寸；没有就留空字符串' },
        },
        required: ['index', 'source_title', 'angle', 'subject', 'strength', 'caution'],
        additionalProperties: false,
      },
    },
    note: { type: 'string', description: '一句话总体判断，比如今天整体没什么可蹭的' },
  },
  required: ['matches', 'note'],
  additionalProperties: false,
};

export const HOTSPOT_SYSTEM =
`你是这个自媒体账号的热点编辑。给你一份全网榜单和这个账号的定位，你要挑出**这个号真的能蹭**的热点。

判断标准：
1. **宁缺毋滥**。只挑和账号定位、目标用户、要解决的问题有真实关联的；关联牵强就不要选。
   **只有「强」和「中」的会被采用，标成「弱」的会被系统直接丢掉**——所以不要用弱关联的条目凑数，那是白写。
   一条都没有就返回空列表，并在 note 里说清今天为什么没有——这是完全可以接受的答案，不要为了凑数硬找。
2. 优先选那些**这个号有独特发言权**的：能用上博主本人的行业、岗位、经验，别人蹭不出这个角度的。
3. 「蹭热点的点」要具体到那座桥：热点里的哪个细节 × 账号关心的哪件事 = 一个新的表达。
   不要写「可以结合这个话题谈谈自己的看法」这种等于没说的话。
4. 「选题建议」是可以直接开写的题材，不是标题，也不是热点原标题的复述。

**红线（必须遵守）**：
- 涉及伤亡、灾难、事故、犯罪、疾病爆发、个人不幸、以及政治敏感的内容，**一律不要作为可蹭热点推荐，直接跳过**。
  这类事件不是流量素材。哪怕它和账号定位沾边，也不要选。
- **点名到具体个人的争议**——要求某人道歉、批评某人、某人被开除/被告/互撕——一律跳过，
  哪怕它背后的公共议题和账号有关。要谈那个议题，就等一条不点名的热点，或者自己另起一个选题。
- 娱乐八卦、明星私事、网络骂战，除非账号定位本身就是这个领域，否则也跳过。
- 如果某条热点本身可以蹭、但容易踩到当事人或读者，就在 caution 里写清分寸；没有风险就留空字符串。

榜单在给你之前，已经由系统过滤掉了伤亡、灾难、犯罪、战争、点名争议、明星私生活这几类；
但过滤是关键词规则，难免有漏网的——**你看到明显属于这几类的，仍然要自己跳过**。

**你只看得到标题**（有的带一句摘要），看不到原文。所以：
- 「蹭热点的点」只能建立在标题/摘要**字面给出的信息**上，不要补充你以为的背景、人物、数据或来龙去脉——你并不知道。
- 如果一条热点光看标题判断不了它到底在说什么，就不要选它。

index 必须是榜单里的真实编号，source_title 必须逐字照抄，不要改写。全部使用简体中文。`;

export const hotspotUser = (persona, items) => {
  const head = [personaBlock(persona), creatorBlock(persona)].filter(Boolean).join('\n\n');
  const list = items
    .map((it, i) => `${i + 1}. [${it.platform}] ${it.title}${it.summary ? `　—　${it.summary.slice(0, 60)}` : ''}`)
    .join('\n');

  return `${head}

—— 当前全网榜单 ——
${list}

请从中挑出这个账号真能蹭的热点，最多 5 条，宁可少也不要硬凑。`;
};

/* ==================================================================
 * 成稿检查：模型自己回头看一遍错字和通顺性
 * ================================================================== */

export const REVIEW_DIMENSIONS = ['账号调性', '平台调性', '公序良俗', '法律风险', '热点使用', '事实存疑'];

export const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    verdict: {
      type: 'string', enum: ['ok', 'minor', 'bad'],
      description: '语言层面：ok=可以直接发；minor=有个别毛病，改掉就行；bad=大面积语无伦次，建议重新生成',
    },
    summary: { type: 'string', description: '一句话总体判断，把语言和风险两方面都带上' },
    issues: {
      type: 'array', minItems: 0, maxItems: 20,
      description: '语言错误，每条都要能逐字替换',
      items: {
        type: 'object',
        properties: {
          quote: { type: 'string', description: '有问题的原文片段，逐字照抄，必须能在原文里一字不差地找到；只截出问题所在的最小片段' },
          type: { type: 'string', enum: ['错字', '语句不通', '重复啰嗦', '前后矛盾', '标点格式'], description: '问题类型' },
          fix: { type: 'string', description: '改好之后的片段，直接替换 quote 用' },
          why: { type: 'string', description: '一句话说明问题在哪，20 字以内' },
        },
        required: ['quote', 'type', 'fix', 'why'],
        additionalProperties: false,
      },
    },
    flags: {
      type: 'array', minItems: 0, maxItems: 12,
      description: '调性与风险层面的提示，不做自动替换，交给作者判断',
      items: {
        type: 'object',
        properties: {
          dimension: {
            type: 'string',
            enum: ['账号调性', '平台调性', '公序良俗', '法律风险', '热点使用', '事实存疑'],
          },
          level: { type: 'string', enum: ['高', '中', '低'], description: '高=不改可能出事；中=建议改；低=提一句' },
          quote: { type: 'string', description: '触发这条的原文片段，逐字照抄；整篇性的问题留空字符串' },
          what: { type: 'string', description: '问题是什么，一到两句说清' },
          suggestion: { type: 'string', description: '具体怎么改，一句话' },
        },
        required: ['dimension', 'level', 'quote', 'what', 'suggestion'],
        additionalProperties: false,
      },
    },
  },
  required: ['verdict', 'summary', 'issues', 'flags'],
  additionalProperties: false,
};

export const REVIEW_SYSTEM =
`你是一位中文自媒体的终审编辑。一篇成稿交到你手上，你要分两层过一遍。

════ 第一层：语言错误（写进 issues）════
只挑客观错误：
1. **错字**——别字、同音字用错、多字漏字。
2. **语句不通**——成分残缺、搭配不当、语序混乱、读起来不知所云。
3. **重复啰嗦**——同一个意思连着说两遍、车轱辘话。
4. **前后矛盾**——同一篇里互相打架的说法。
5. **标点格式**——中英文标点混用、括号引号不成对、Markdown 标记写坏。

quote 必须从原文**逐字照抄**（含标点），且只截**最小片段**；原文里找不到的 quote 等于无效。
fix 只修错，不做任何风格改动。整篇大面积语无伦次时 verdict 给 bad，并在 summary 里直说建议重新生成。

════ 第二层：调性与风险（写进 flags）════
按这六个维度查，每条给出 level：高=不改可能出事，中=建议改，低=提一句。

**账号调性**——对照上面给的账号设定、个人人设和（如果有）所属栏目：这篇是不是这个号该发的？
  指定了栏目却写成了别的栏目的样子（比如「来时路」写成了干货教程），也算。
  跑到定位之外、面向的不是它的目标用户、没有回应它要解决的问题、违反它写明的禁忌、
  或者语气明显不像这个人（有语气档案时对照档案）——才报。

**平台调性**——对照给出的平台写作规范：结构、篇幅、开头方式、排版、结尾习惯是否明显不合。
  比如小红书写成了长篇论述、口播脚本没有分栏、公众号通篇短句没有小标题。

**公序良俗**——地域/性别/年龄/职业/学历歧视，贬低特定人群，煽动对立，
  贩卖焦虑到极端，低俗擦边，美化违法或危险行为。

**法律风险**——中国自媒体最常踩的这几条：
  · 广告法绝对化用语：国家级、最高级、最佳、第一、唯一、永久、根治、100%、无副作用……
  · 医疗保健的疗效/治愈承诺，药品器械功效宣称
  · 投资理财的收益承诺、荐股、"稳赚"
  · 像推广但没标明是广告
  · 点名贬损具体企业或个人（商誉）、泄露他人隐私
  · 未授权使用他人作品、肖像、商标

**热点使用**——只有在给了「借势的热点」时才查：
  正文里关于这条热点的事实陈述，有没有超出所给概要的范围？
  概要为空却写了具体细节、数字、当事人说法的，一律报高。
  另外看有没有对当事人不当消费、或把不该蹭的事件当流量素材。

**事实存疑**——具体数字、比例、机构名、研究结论、他人引语，被当成事实写出来但没有可核查的出处的。
  「据报道」「有数据显示」「研究表明」后面跟着无从查证的内容，都算。
  这类只指出来让作者去核实，不要替他判断真假。

════ 绝对不要报的 ════
- 口语、短句、省略句、网络用语、语气词、emoji、话题标签——自媒体的正常写法。
- 观点尖锐、有立场、吐槽、自嘲——这是风格不是问题。
- 你个人觉得"可以写得更好"的地方。详略、观点、结构偏好都不归你管。
- 为了显得认真而硬凑。两层都没问题就返回两个空列表，那是好结果。

quote 在 flags 里同样要逐字照抄；整篇性的问题（比如篇幅明显不合平台）quote 留空字符串。
全部使用简体中文。`;

export const reviewUser = (draft, text, persona, samples = []) => {
  const context = [
    personaBlock(persona),
    creatorBlock(persona),
    styleBlock(persona, samples),
    sectionBlock(draft.section, draft.inputs),
    hotspotRefBlock(draft.hotspot),
    `—— 平台写作规范（${platformSpec(draft.platform).label}）——\n${platformSpec(draft.platform).spec}\n目标篇幅：约 ${draft.length} 字`,
  ].filter(Boolean).join('\n\n');

  return `${context}

—— 待审成稿 ——
===== 正文开始 =====
${text}
===== 正文结束 =====

请按两层过一遍：语言错误写进 issues，调性与风险写进 flags。`;
};

/* 把抓到的原文压成概要 —— 只允许复述原文，不许补充 */
export const ARTICLE_SUMMARY_SYSTEM =
`你在为一位自媒体作者做资料卡。给你一篇文章的正文，请压成 2-3 句话的概要。
要求：
1. 只写原文里**确实说了**的事：发生了什么、谁说的、关键数字或结论。
2. 不要评价，不要引申，不要补充原文之外的背景——你只是在复述。
3. 抓到的正文可能夹带网页导航、广告、评论区文字，忽略它们，只概括主体内容。
4. 如果正文残缺到看不出在讲什么，只回一个字：无。
5. 120 字以内，简体中文，直接输出概要本身。`;

export const articleSummaryUser = (title, body) =>
`标题：${title}

正文（可能含网页杂质）：
${body}`;

/* 创作时引用热点：只能用概要里的信息 */
export const hotspotRefBlock = (hot) => {
  if (!hot?.title) return null;
  const summary = String(hot.summary || '').trim();
  return `—— 本篇要借势的热点 ——
原标题：${hot.title}${hot.platform ? `（来源：${hot.platform}）` : ''}
${summary ? `原文概要：${summary}` : '原文概要：抓不到原文，只有这个标题。'}
${hot.angle ? `蹭这条的角度：${hot.angle}` : ''}

写作要求：
- 在开头或前三分之一处**自然地把这条热点当作由头引出来**，别写成新闻转述，也别通篇围着它转——它是引子，账号自己的观点才是主体。
- ${summary
    ? '引用时只能用上面概要里给出的信息。概要没说的细节、数字、人名、时间一律不要写。'
    : '**没有原文概要，所以你不知道这条热点的具体内容**。只能写到「最近大家在讨论 XX」这个程度，绝对不要编造事件细节、数据或当事人说法。'}
- 不要写「据报道」「有数据显示」这类看似有出处、实则没有的表述。`;
};

/* ==================================================================
 * 内容栏目：一个账号下的几条内容线
 * ================================================================== */

/* 预设只是起手模板，用户可以改可以删，也可以完全自定义 */
export const SECTION_PRESETS = [
  {
    name: '来时路',
    purpose: '讲清楚这个号是怎么来的、为什么是我在做、和同类账号的不一样在哪',
    guide: '用具体的时间点和转折事件推进，不喊口号不写宣言；把「为什么是我」落在真实经历和代价上；'
      + '差异化不要自夸，用别人做不到的具体事实说话；结尾给读者一个继续看下去的理由。',
    fields: [
      { label: '你的背景经历', hint: '做过什么、在哪待过、有什么别人没有的经历', required: true },
      { label: '为什么开始做这个号', hint: '触发你开始的那件事或那个念头', required: true },
      { label: '和同类账号的不一样', hint: '别人做不到、或者不愿意做的是什么' },
      { label: '想让读者记住你什么', hint: '一句话' },
    ],
  },
  {
    name: '生活日常',
    purpose: '记录日常里和账号定位相关的真实片段，让读者看到人，而不只是内容',
    guide: '场景优先、细节先行，从一个具体的时刻切进去；允许没有结论、不硬塞道理；'
      + '和账号主题保持若即若离的关联，不要写成流水账。',
    fields: [
      { label: '具体是哪天、什么场景', hint: '时间、地点、当时在干嘛', required: true },
      { label: '发生了什么', hint: '按顺序说，越具体越好', required: true },
      { label: '你当时的感受', hint: '不用升华，如实说' },
    ],
  },
  {
    name: '干货教程',
    purpose: '把一件具体的事拆成读者今天就能照着做的步骤',
    guide: '开头先说清这篇能解决什么问题、适合谁；步骤要能被验证，给判断标准而不只是动作；'
      + '标出常见的坑和对应的修正；结尾给一个最小可行的起点。',
    fields: [
      { label: '要教会读者做什么', hint: '做完之后他能得到什么结果', required: true },
      { label: '你自己的实操经验', hint: '你是怎么做的、用了什么工具、花了多久', required: true },
      { label: '常见的坑', hint: '你见过别人在哪一步翻车' },
      { label: '判断做对了的标准', hint: '怎么知道这一步做成了' },
    ],
  },
  {
    name: '行业观察',
    purpose: '从行业里正在发生的变化，讲出对读者有用的判断',
    guide: '先给结论再拆机制；用可核查的事实或亲历案例支撑，不堆形容词；'
      + '承认判断的边界和不确定性；落到读者能做的动作上。',
    fields: [
      { label: '你观察到的变化', hint: '具体是什么在变，从什么变成什么', required: true },
      { label: '你的判断', hint: '你认为这意味着什么', required: true },
      { label: '支撑判断的事实或案例', hint: '你亲历的、或可核查的；没有就留空，不要编' },
      { label: '这个判断的边界', hint: '什么情况下它不成立' },
    ],
  },
  {
    name: '答读者问',
    purpose: '回答读者反复问到的问题，一次说透一个',
    guide: '开头复述问题和提问者的处境，让同类读者对上号；先给直接答案再解释为什么；'
      + '区分不同处境下的不同做法；不回避「这件事没有标准答案」。',
    fields: [
      { label: '读者的原问题', hint: '尽量原话，别改写', required: true },
      { label: '提问者的处境', hint: '什么行业、什么阶段、卡在哪' },
      { label: '你的答案要点', hint: '先说结论，再列理由', required: true },
    ],
  },
  {
    name: '避坑指南',
    purpose: '把自己或身边人踩过的坑讲清楚，让读者少走弯路',
    guide: '每个坑写清楚：当时怎么想的、实际发生了什么、代价是什么、现在会怎么做；'
      + '不居高临下，承认当时的判断在当时是合理的；给可复用的识别信号。',
    fields: [
      { label: '踩过的坑', hint: '一个或几个，具体说', required: true },
      { label: '当时是怎么想的', hint: '为什么当时觉得那样做是对的' },
      { label: '实际代价', hint: '损失了什么：钱、时间、机会', required: true },
      { label: '现在你会怎么做', hint: '可复用的做法或识别信号' },
    ],
  },
  {
    name: '幕后故事',
    purpose: '把做这件事的过程本身讲出来，包括不体面的部分',
    guide: '有具体的时间线和数字；写出犹豫、返工和放弃掉的方案；'
      + '不做成功学叙事，允许结果是平淡的。',
    fields: [
      { label: '时间线', hint: '什么时候开始、经过了哪几个阶段', required: true },
      { label: '关键决定', hint: '哪几个岔路口，你选了什么', required: true },
      { label: '返工或放弃掉的方案', hint: '试过但没成的' },
      { label: '结果', hint: '如实说，平淡也没关系' },
    ],
  },
];

export const sectionBlock = (section, inputs = null) => {
  if (!section?.name) return null;
  const lines = [
    `栏目名：${section.name}`,
    section.purpose ? `这个栏目讲什么：${section.purpose}` : null,
    section.guide ? `这个栏目的写作要点：${section.guide}` : null,
  ].filter(Boolean);

  const head = `—— 本篇所属栏目 ——
${lines.join('\n')}

本篇必须是这个栏目该有的样子：它和账号里其它栏目的区别，就体现在上面这几句里。
栏目要点和通用的平台规范冲突时，以栏目要点为准——它更贴近这个号自己的做法。`;

  const materials = sectionInputsBlock(section, inputs);
  return materials ? `${head}\n\n${materials}` : head;
};

/* 栏目要的素材：作者自己填的，是这篇里唯一可信的事实来源 */
export const sectionInputsBlock = (section, inputs) => {
  const fields = Array.isArray(section?.fields) ? section.fields : [];
  if (!fields.length || !inputs) return null;

  const filled = fields
    .map((f) => ({ label: f.label, value: String(inputs[f.label] ?? '').trim() }))
    .filter((f) => f.value);
  const missing = fields.filter((f) => !String(inputs[f.label] ?? '').trim()).map((f) => f.label);
  if (!filled.length) return null;

  return `—— 作者为这个栏目提供的素材 ——
${filled.map((f) => `【${f.label}】${f.value}`).join('\n')}

这些是作者本人提供的真实信息，**是这篇里唯一可信的事实来源**：
- 写作时优先用它们，把它们展开成有细节的段落，而不是原样复述一遍。
- **不要编造它们之外的个人经历、时间、地点、数字、职位或人物关系。**${missing.length
    ? `\n- 作者没有填「${missing.join('」「')}」，说明他没提供这部分信息——不要脑补，绕开或用不涉及具体事实的方式处理。`
    : ''}`;
};

/* ==================================================================
 * 口播提示：语气 / 重读 / 停顿 / 表情 / 动作
 * 单独一层，不往成稿正文里塞标记——正文该保持干净可直接发
 * ================================================================== */

/* 情绪的固定分类——模型给的 emotion 是自由发挥的文字，
   关键词匹配基本命中不了，所以让它顺手归到这五类里的一类 */
export const TONE_TAGS = ['日常', '激动', '沉稳', '吐槽', '温柔'];

export const CUES_SCHEMA = {
  type: 'object',
  properties: {
    overall: {
      type: 'object',
      properties: {
        tone: { type: 'string', description: '整体情绪基调，一句话' },
        pace: { type: 'string', description: '整体语速与节奏建议，一句话' },
        note: { type: 'string', description: '出镜时最该注意的一件事，一句话；没有就留空字符串' },
      },
      required: ['tone', 'pace', 'note'],
      additionalProperties: false,
    },
    cues: {
      type: 'array', minItems: 1, maxItems: 24,
      items: {
        type: 'object',
        properties: {
          quote: { type: 'string', description: '这段要念的原文，从正文里逐字照抄，按出现顺序，段落之间不重叠' },
          emotion: { type: 'string', description: '这段用什么情绪念，具体些，如「压着火」「带点自嘲」；平铺直叙就写「平述」' },
          tone_tag: {
            type: 'string', enum: ['日常', '激动', '沉稳', '吐槽', '温柔'],
            description: '把上面的情绪归到最接近的一类，便于下游做确定性匹配。拿不准就给「日常」',
          },
          stress: {
            type: 'array', maxItems: 4, items: { type: 'string' },
            description: '要重读的词，必须是这段原文里出现过的词；没有特别要重读的就给空数组',
          },
          pause: { type: 'string', description: '停顿位置和时长，如「说完"三小时"停一拍」；不需要就留空字符串' },
          expression: { type: 'string', description: '表情，如「挑眉」「先笑一下再收住」；不需要就留空字符串' },
          gesture: { type: 'string', description: '动作，如「摊手」「比三根手指」；不需要就留空字符串' },
        },
        required: ['quote', 'emotion', 'tone_tag', 'stress', 'pause', 'expression', 'gesture'],
        additionalProperties: false,
      },
    },
  },
  required: ['overall', 'cues'],
  additionalProperties: false,
};

export const CUES_SYSTEM =
`你是给出镜口播做表演指导的人。给你一篇要念出来的稿子，你要标出该怎么念、什么表情、什么动作。

**怎么切段**：按「一口气念完的一句或几句」切，不是按标点也不是按段落。
quote 必须从正文**逐字照抄**（含标点），按正文顺序排列，段落之间不重叠。
标题、小标题、话题标签这类不念出来的内容跳过，不要给它们标提示。

**每条要给什么**：
- emotion：这段用什么情绪念。要具体——「压着火」「带点自嘲」「像跟朋友吐槽」，
  而不是「认真地」「深情地」这种没法执行的词。真的就是平铺直叙，就写「平述」。
- tone_tag：把 emotion 归到「日常/激动/沉稳/吐槽/温柔」里最接近的一类。
  激动=兴奋惊讶热情，沉稳=认真严肃笃定，吐槽=自嘲嫌弃调侃，温柔=共情安慰亲切，其余给日常。
- stress：要重读的词，**必须是这段原文里真实出现过的词**，最多 4 个。没有特别要强调的就给空数组。
- pause：停顿在哪、停多久，如「说完"三小时"停一拍再接下句」。不需要就留空字符串。
- expression：表情。**真人出镜的自然幅度**，不是舞台剧也不是默剧——挑眉、抿嘴、先笑一下再收住，
  这种程度。绝大多数句子不需要专门的表情，不需要就留空字符串。
- gesture：动作。同样克制：摊手、比数字、指一下镜头、身体前倾。不需要就留空字符串。

**铁律**：
1. **不要每条都填满**。一篇稿子里真正需要专门标表情或动作的地方通常不超过三分之一。
   为了显得认真而每句都配一个动作，念出来会像提线木偶——留空是完全正确的答案。
2. 给了博主人设的，表情和动作要符合这个人：性格内敛的人不要让他挥手跳跃。
3. 只做表演指导，**不要改写、增删正文一个字**。
4. 全部使用简体中文。`;

export const cuesUser = (draft, persona, text) => {
  const context = [
    creatorBlock(persona),
    `—— 发布平台 ——\n${platformSpec(draft.platform).label}${draft.tone ? `　调性：${draft.tone}` : ''}`,
  ].filter(Boolean).join('\n\n');

  return `${context}

—— 要念的稿子 ——
===== 正文开始 =====
${text}
===== 正文结束 =====

请标出该怎么念、什么表情、什么动作。记住：不需要的地方就留空，不要凑。`;
};

/* ==================================================================
 * 多平台适配：把一篇成稿改写成另一个平台的版本
 *
 * 关键决定是**改写，不是重新生成**。
 * 重新生成会让每个平台的事实、例子、数字各说各的——同一件事在小红书和公众号
 * 变成两个故事，读者一对照就露馅，而且和"栏目素材是唯一可信事实来源"那条直接冲突。
 * 所以这里只准重排结构、调语气、增删详略，事实层一个字都不能动。
 * ================================================================== */

export const ADAPT_SYSTEM =
`你要把一篇已经写好的稿子，改成另一个平台的版本。

**最重要的一条：事实层不许动。**
原文里的经历、时间、地点、数字、人物、案例、结论——一个都不能改、不能加。
目标平台篇幅短就**整块删**，不要把每句话压缩成缩写体；篇幅长可以把原有的点展开讲透，
但展开只能用原文已有的信息，**不许补充原文没有的事实、案例或数据**。

**要改的是这三样**：
1. **结构**：按目标平台的阅读方式重排。公众号要小标题分节，小红书要短段和清单，
   微博要一句立住观点，口播要能顺口念出来。
2. **语气**：按目标平台的惯例调整书面/口语的程度。
3. **详略**：哪些点该展开、哪些该一笔带过，取决于这个平台的读者要什么。

**铁律**：
1. **不许把原平台的格式痕迹带过来**。原文是口播脚本就不要保留【口播】【画面】这类分栏标注；
   原文是小红书就不要把 #话题标签 带进公众号。目标平台不用的格式，一律去掉。
2. 目标平台的字数是硬约束，宁可少写一个点，也不要超。
3. 只输出改好的正文，**不要任何说明、前言、"以下是…"**，也不要用引号包起来。
4. 全部使用简体中文。`;

export const adaptUser = (draft, persona, text, fromKey, toKey) => {
  const from = platformSpec(fromKey);
  const to = platformSpec(toKey);
  const context = [
    creatorBlock(persona),
    draft.tone ? `—— 账号调性 ——\n${draft.tone}` : null,
  ].filter(Boolean).join('\n\n');

  return `${context}

—— 原文是给「${from.label}」写的 ——
===== 原文开始 =====
${text}
===== 原文结束 =====

—— 要改成「${to.label}」 ——
${to.spec}
篇幅：${to.length} 字左右。

请给出「${to.label}」版本的正文。记住：结构、语气、详略可以改，**事实一个字都不能动**。`;
};

/* ==================================================================
 * 图文配图：给一篇文章挑几个插图位
 *
 * 保不住人物一致性，已经证明不可用。这里是**一篇 2-5 张**的文章插图，
 * 而且明确要求**不画具体的人**——公众号插图本来就该是概念图和场景图，
 * 绕开人物，一致性问题就不存在。
 * ================================================================== */

export const ILLUS_SCHEMA = {
  type: 'object',
  properties: {
    look: { type: 'string', description: '整篇统一的视觉风格，一句话，会拼进每张图的提示词' },
    items: {
      type: 'array', minItems: 1, maxItems: 5,
      items: {
        type: 'object',
        properties: {
          anchor: {
            type: 'string',
            description: '这张图插在哪一段之后。从正文里**逐字照抄**那一段的开头 10-20 个字，必须能在正文里找到',
          },
          prompt: { type: 'string', description: '画面提示词。只写看得见的东西，不含风格词（风格由 look 统一给）' },
          alt: { type: 'string', description: '图注，12 字以内；不需要图注就给空字符串' },
        },
        required: ['anchor', 'prompt', 'alt'],
        additionalProperties: false,
      },
    },
  },
  required: ['look', 'items'],
  additionalProperties: false,
};

export const ILLUS_SYSTEM =
`你要给一篇文章挑几个插图位，并说清楚每张图画什么。

**插几张**：按文章长度和结构定，2-5 张。**宁可少插**——
每隔两段就来一张会打断阅读，插图是给长文换气用的，不是填空。
插图位应该落在**章节之间**或**一个大段落讲完之后**，不要插在一句话中间。

**画面提示词怎么写**：
- 只写**看得见的东西**：主体、环境、光线、构图、色调。具体到能画出来。
- **不要画具体的人。** 需要表现"人"的时候，用手部特写、背影剪影、空的工位、
  两把对放的椅子这类**不指向某个具体面孔**的方式。
  （原因很实际：每张图独立生成，画了人就会是几个不同的人。）
- **不要写字**。画面里出现文字几乎必然是乱码。
- 不要写风格词（"电影感""高级感"），整篇风格由 look 统一给，写两处会打架。

**图和文的关系**：插图是**换气和烘托**，不是图解。
讲"三个月的煎熬"不要画日历；画一张深夜里只剩显示器亮着的桌面。

**铁律**：
1. anchor 必须从正文**逐字照抄**，取那一段开头的 10-20 个字，且必须真的能在正文里找到。
2. look 里把**色调、媒介、光线**三件事定死，让几张图看起来像一篇文章里的。
3. 涉及真人肖像、品牌标识、他人作品的，绕开。
4. 全部使用简体中文。`;

export const illusUser = (draft, persona, text, platformKey) => {
  const p = platformSpec(platformKey);
  const context = [creatorBlock(persona), `—— 发布平台 ——\n${p.label}`].filter(Boolean).join('\n\n');
  return `${context}

—— 文章正文 ——
===== 正文开始 =====
${text}
===== 正文结束 =====

请给出插图方案。记住：宁可少插，不要画具体的人，anchor 必须逐字照抄正文里的一段开头。`;
};

/* ==================================================================
 * 素材召回
 *
 * 和栏目素材是同一层意思——**作者提供的真实信息**，是这篇里唯一可信的事实来源。
 * 区别只在来源：栏目素材是这篇现填的，素材库是攒下来的。
 * 拼进 user 消息时用同样的措辞，模型不需要区分这两者。
 * ================================================================== */

export const materialsBlock = (list) => {
  if (!list?.length) return null;
  return `—— 作者素材库里和这个题材相关的记录 ——
${list.map((m) => `【${m.kind}】${m.title}\n${m.body}`).join('\n\n')}

这些是作者本人积累的真实素材，**和栏目素材一样，是这篇里可信的事实来源**：
- 用得上就用，把它们展开成有细节的段落，不要原样罗列。
- **用不上的不要硬塞**——为了用素材而跑题，比不用素材更糟。
- 同样**不要编造它们之外的个人经历、时间、数字、职位或人物关系**。`;
};

/* ---------- 关键词搜新闻：把搜索结果汇总成一个创作方向 ---------- */
export const SEARCH_DIGEST_SYSTEM = `你是自媒体账号的选题策划。用户按关键词搜了一批新闻交给你通读。
从这批报道里提炼一个值得写、有表达空间的创作题材，不是复述新闻本身。
只输出 JSON：{ "subject": "创作题材，可直接作为简报输入", "angle": "切入角度一句话", "reason": "为什么值得写，一句话" }。
题材要具体可落笔，不要「浅谈」「盘点」这类空词。`;

export function searchDigestUser(q, items) {
  return `关键词：${q}\n\n搜索结果（${items.length} 条）：\n`
    + items.map((it, i) => `${i + 1}. ${it.title}${it.summary ? `\n   ${it.summary}` : ''}`).join('\n')
    + '\n\n请提炼一个创作题材方向。';
}
