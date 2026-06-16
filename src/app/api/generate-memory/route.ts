import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getSessionUser } from "@/lib/server/auth";
import { requireDb } from "@/lib/server/cf";

export const runtime = "edge";

type GenerateInput = {
  moment?: string;
  place?: string;
  mood?: string;
  moodLabel?: string;
  stream?: boolean;
};

type PersonaDerived = {
  writingTone?: string;
  contentFocus?: string;
  shareContext?: string;
  coreMotivation?: string;
  avoidPattern?: string;
};

type Persona = { derivedPersona?: PersonaDerived; sampleText?: string };

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function withAiMeta(memory: unknown, ai: { source: string; model?: string | null; reason?: string | null }) {
  return { ...(memory as object), ai: { source: ai.source, model: ai.model ?? null, reason: ai.reason ?? null } };
}

function createMockMemory(input: GenerateInput) {
  const place = (input.place || "").split(/[·•·,，]/)[0].trim() || "某个地方";
  const moodLabel = input.moodLabel || input.mood || "平静";
  const moment = (input.moment || "").trim();
  const firstSentence = moment.split(/[。！？.!?]/)[0].slice(0, 40) || moment.slice(0, 40);
  return {
    title: `${place}，${moodLabel}的某个下午`,
    story: `${firstSentence}。${place}的空气里有什么，说不清楚，只是站在那里觉得还好。没什么大事，也没有要特别记住的理由——但你还是拿出手机，想把这个时刻存下来。这件事本身，也许就是它值得被记住的原因。`,
    tags: [place, moodLabel, "日常", moment.includes("家人") || moment.includes("爸") || moment.includes("妈") ? "家人" : "独处时刻"],
  };
}

async function buildPersonaBlock(request: Request): Promise<string> {
  try {
    const db = await requireDb();
    const user = await getSessionUser(db, request);
    if (!user) return "";
    const row = await db
      .prepare("SELECT persona_json FROM users WHERE id = ?1")
      .bind(user.id)
      .first<{ persona_json: string | null }>();
    if (!row?.persona_json) return "";
    const p = JSON.parse(row.persona_json) as Persona;
    if (!p.derivedPersona) return "";
    const dp = p.derivedPersona;
    return [
      "",
      "【关于这位用户（根据他/她的侧写定制输出）】",
      dp.writingTone ? `- 写作气质：${dp.writingTone}` : "",
      dp.contentFocus ? `- 关注焦点：${dp.contentFocus}` : "",
      dp.shareContext ? `- 发布场景：${dp.shareContext}` : "",
      dp.coreMotivation ? `- 记录初心：${dp.coreMotivation}` : "",
      dp.avoidPattern ? `- 需要避免：${dp.avoidPattern}` : "",
      p.sampleText ? `- 语气参考：「${String(p.sampleText).slice(0, 120)}」` : "",
      "请让生成结果读起来像这个人自己写的好版本，而非通用 AI 文案。",
    ]
      .filter(Boolean)
      .join("\n");
  } catch {
    return "";
  }
}

export async function POST(request: Request) {
  const input = (await request.json().catch(() => null)) as GenerateInput | null;
  if (!input?.moment) {
    return jsonRes({ error: "moment is required" }, 400);
  }

  const { env } = await getCloudflareContext({ async: true });
  const apiKey = (env as unknown as { OPENAI_API_KEY?: string }).OPENAI_API_KEY;
  const model = (env as unknown as { OPENAI_MODEL?: string }).OPENAI_MODEL || "gpt-5.2";

  if (!apiKey) {
    return jsonRes(withAiMeta(createMockMemory(input), { source: "mock", model, reason: "missing_openai_api_key" }));
  }

  const personaBlock = await buildPersonaBlock(request);
  const moodLabel = input.moodLabel || input.mood || "";

  const prompt = [
    "你是 TripTrace.ai 的人生记忆整理助手。",
    "把用户的生活碎片整理成一张安静、真实、有画面感的记忆卡片。",
    "",
    "【写作规则——逐条严格执行】",
    "1. 克制，不煽情。像懂得留白的旁白，不是日记也不是散文。",
    "2. 只用具体的感官细节（光线/气味/声音/温度/触感）描述场景，不用情绪词替代感受。",
    "3. story 首句直接入场景（不要铺垫，不要交代背景），结尾留白或悬而未决。",
    "4. 【硬性禁止，出现即失败】：",
    "   - 禁止任何升华句：「值得珍惜」「美好时光」「难忘的」「充满意义」「人生里」「真正重要」「记住这一刻」「感谢」「幸福」「珍贵」",
    "   - 禁止道理/感悟：不能在结尾总结「所以……」「原来……」「这才明白……」",
    "   - 禁止点题：不能解释这件事为什么值得记录",
    "5. tags 只用能「拍成照片」的具体名词或短语。",
    "   禁止：温暖、珍贵、意义、成长、平静、感动、美好、值得保存、独处时刻、难忘",
    "   允许：茶馆、下雨天、陪爸妈、渡月桥、抹茶、早上九点、碎石路、吉他声",
    "",
    "【格式】",
    "标题：≤ 18 字，像一帧画面的注脚，不用感叹号",
    "story：100–150 字",
    "tags：4–6 个具体词",
    "",
    "---",
    "【示例】",
    "输入：今天和爸妈在杭州西湖散步，下午下了一点雨，我们在湖边喝茶，突然觉得这些平常的时间很珍贵。",
    "地点：杭州·西湖 | 心情：温暖",
    "",
    '输出：{"title":"下雨的西湖，茶还没喝完","story":"雨是突然下的，细细的，落在湖面上没有声音。茶馆的椅子有点潮，爸爸撑着伞没怎么动，妈妈在说什么，你没完全听进去，只是觉得坐在这里还不错。龙井泡了第三道，颜色已经很淡了，没有人提起要走。","tags":["西湖","下雨天","陪爸妈","湖边茶馆","下午时光"]}',
    "",
    "注意示例中：结尾「没有人提起要走」——没有升华，没有感悟，只是一个事实。",
    "---",
    personaBlock,
    `地点：${input.place || "未指定"}`,
    `心情：${moodLabel || "未指定"}`,
    `用户记录：${input.moment}`,
  ]
    .filter((s) => s !== undefined)
    .join("\n");

  const useStream = input.stream === true;

  const requestBody = {
    model,
    input: prompt,
    stream: useStream,
    text: {
      format: {
        type: "json_schema",
        name: "triptrace_memory_card",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            title: { type: "string" },
            story: { type: "string" },
            tags: { type: "array", minItems: 4, maxItems: 6, items: { type: "string" } },
          },
          required: ["title", "story", "tags"],
        },
      },
    },
  };

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    return jsonRes(withAiMeta(createMockMemory(input), { source: "mock", model, reason: `openai_http_${response.status}` }));
  }

  if (useStream) {
    return new Response(response.body, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
      },
    });
  }

  const data = (await response.json()) as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> };
  const text = data.output_text || data.output?.[0]?.content?.[0]?.text;

  try {
    return jsonRes(withAiMeta(JSON.parse(text || ""), { source: "openai", model }));
  } catch {
    return jsonRes(withAiMeta(createMockMemory(input), { source: "mock", model, reason: "openai_parse_failed" }));
  }
}

export async function GET() {
  return jsonRes({ ok: true, service: "TripTrace.ai memory generation", provider: "OpenAI GPT on Cloudflare Workers" });
}
