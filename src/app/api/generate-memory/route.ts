import type { D1Database } from "@cloudflare/workers-types";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getSessionUser, type SessionUser } from "@/lib/server/auth";
import { HttpError, requireDb } from "@/lib/server/cf";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { ENTITLEMENT_CODES } from "@/lib/plans";
import {
  METRIC_AI_GENERATION,
  assertImageCount,
  entitlementDeniedResponse,
  getEntitlements,
  releaseUsage,
  reserveUsage,
} from "@/lib/server/entitlements";

export const dynamic = "force-dynamic";

type GenerateInput = {
  moment?: string;
  place?: string;
  mood?: string;
  moodLabel?: string;
  images?: string[];
  stream?: boolean;
  /** Total photos attached to the draft, which may exceed the bounded vision subset. */
  photoCount?: number;
  /** Local guest device identifier, used only to meter the anonymous AI demo. */
  guestId?: string;
};

type PersonaDerived = {
  writingTone?: string;
  contentFocus?: string;
  shareContext?: string;
  coreMotivation?: string;
  avoidPattern?: string;
};

type Persona = { derivedPersona?: PersonaDerived; sampleText?: string };

function normalizeImages(images: unknown): string[] | null {
  if (images === undefined) return [];
  if (!Array.isArray(images) || images.length > 4) return null;
  const normalized = images.map((image) => String(image));
  const dataImagePattern = /^data:image\/(?:jpeg|png|webp);base64,[a-zA-Z0-9+/=]+$/;
  if (normalized.some((image) => image.length > 5_000_000 || !dataImagePattern.test(image))) return null;
  return normalized;
}

function jsonRes(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}

function withAiMeta(memory: unknown, ai: { source: string; model?: string | null; reason?: string | null }) {
  return { ...(memory as object), ai: { source: ai.source, model: ai.model ?? null, reason: ai.reason ?? null } };
}

function createMockMemory(input: GenerateInput) {
  const place = (input.place || "").split(/[·•,，]/)[0].trim() || "A place to confirm";
  const moodLabel = input.moodLabel || input.mood || "A feeling to confirm";
  const moment = (input.moment || "").trim();
  const firstSentence =
    moment.split(/[。！？.!?]/)[0].slice(0, 90) ||
    "These photos hold a moment whose details are still yours to confirm";
  return {
    title: moment ? `${place}, a moment to keep` : "A photo trace to complete",
    story: `${firstSentence}. Review the time, place, people, and story before keeping this trace.`,
    tags: [place, moodLabel, "photo trace", "needs review"],
  };
}

async function buildPersonaBlock(db: D1Database, user: SessionUser | null): Promise<string> {
  try {
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
  try {
    return await handleGenerate(request);
  } catch (thrown) {
    if (thrown instanceof HttpError) return thrown.response;
    console.error("generate_memory_failed", thrown);
    return jsonRes({ error: { code: "generation_failed", message: "Generation failed." } }, 500);
  }
}

async function handleGenerate(request: Request) {
  const input = (await request.json().catch(() => null)) as GenerateInput | null;
  if (!input || (!input.moment?.trim() && !input.images?.length)) {
    return jsonRes({ error: "Add words, photos, or both." }, 400);
  }
  const images = normalizeImages(input.images);
  if (!images) {
    return jsonRes({ error: "Images must be bounded JPEG, PNG, or WebP data URLs." }, 400);
  }

  const db = await requireDb();
  const user = await getSessionUser(db, request);

  // Coarse IP throttle. It does not replace the plan quota; it stops a caller from
  // churning guest device ids or hammering the route while a quota check is in flight.
  const throttled = await checkRateLimit(
    db,
    request,
    user ? "generate_memory_user" : "generate_memory_guest",
    user ? 60 : 10,
    60 * 60 * 1_000,
  );
  if (throttled) return throttled;

  const entitlements = await getEntitlements(db, user, request, input.guestId);

  const declaredPhotoCount = Number.isFinite(input.photoCount) ? Number(input.photoCount) : 0;
  const photoCount = Math.max(declaredPhotoCount, images.length);
  const imageDenial = assertImageCount(entitlements, photoCount);
  if (imageDenial) return imageDenial;

  const { env } = await getCloudflareContext({ async: true });
  const apiKey = (env as unknown as { OPENAI_API_KEY?: string }).OPENAI_API_KEY;
  const model = (env as unknown as { OPENAI_MODEL?: string }).OPENAI_MODEL || "gpt-5.2";

  if (!apiKey) {
    // No provider call happens, so no allowance is spent on a local fallback draft.
    return jsonRes(
      withAiMeta(createMockMemory(input), {
        source: "mock",
        reason: "missing_openai_api_key",
      }),
    );
  }

  // Claim the allowance before spending money upstream, then hand it back below if the
  // provider call does not produce a usable draft.
  const reservation = await reserveUsage(
    db,
    entitlements.subjectKey,
    entitlements.aiPeriodKey,
    METRIC_AI_GENERATION,
    entitlements.limits.aiGenerations,
  );
  if (!reservation.ok) {
    return entitlementDeniedResponse({
      code: entitlements.signedIn
        ? ENTITLEMENT_CODES.generationLimitReached
        : ENTITLEMENT_CODES.guestDemoUsed,
      planKey: entitlements.planKey,
      limit: entitlements.limits.aiGenerations,
      used: reservation.used,
    });
  }

  const refund = () =>
    releaseUsage(db, entitlements.subjectKey, entitlements.aiPeriodKey, METRIC_AI_GENERATION);

  const personaBlock = await buildPersonaBlock(db, user);
  const moodLabel = input.moodLabel || input.mood || "";

  const prompt = [
    "You are the drafting assistant for TripTrace.ai, an English-first AI Life Atlas.",
    "Turn the user's words and photos into a restrained, specific memory draft.",
    "Never invent or silently correct time, location, identity, relationships, or what happened.",
    "If a fact is not supplied or visually certain, leave it out. Do not infer sensitive traits.",
    "Describe only visible details from images and explicit details from the user's note.",
    "Open directly in the scene. Avoid clichés, life lessons, sentimentality, and explaining why the moment matters.",
    "Write a title under 12 words, a story of 80-140 words, and 4-6 concrete tags.",
    "The result is a draft. The user will confirm facts before saving.",
    personaBlock,
    `Place supplied by user: ${input.place || "not supplied"}`,
    `Mood supplied by user: ${moodLabel || "not supplied"}`,
    `User note: ${input.moment || "No note supplied; rely only on visible image details."}`,
  ]
    .filter((s) => s !== undefined)
    .join("\n");

  const useStream = input.stream === true;

  const imageContent = images.map((imageUrl) => ({
    type: "input_image",
    image_url: imageUrl,
  }));
  const requestBody = {
    model,
    input: [
      {
        role: "user",
        content: [{ type: "input_text", text: prompt }, ...imageContent],
      },
    ],
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

  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });
  } catch {
    await refund();
    return jsonRes(
      withAiMeta(createMockMemory(input), {
        source: "mock",
        reason: "openai_unreachable",
      }),
    );
  }

  if (!response.ok) {
    await refund();
    return jsonRes(
      withAiMeta(createMockMemory(input), {
        source: "mock",
        reason: `openai_http_${response.status}`,
      }),
    );
  }

  const usageHeaders = {
    "X-TripTrace-Usage-Used": String(reservation.used),
    "X-TripTrace-Usage-Limit": String(entitlements.limits.aiGenerations),
    "X-TripTrace-Plan": entitlements.planKey,
  };

  if (useStream) {
    return new Response(response.body, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
        "X-TripTrace-AI-Source": "openai",
        "X-TripTrace-AI-Model": model,
        ...usageHeaders,
      },
    });
  }

  const data = (await response.json()) as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> };
  const text = data.output_text || data.output?.[0]?.content?.[0]?.text;

  try {
    return jsonRes(withAiMeta(JSON.parse(text || ""), { source: "openai", model }), 200, usageHeaders);
  } catch {
    await refund();
    return jsonRes(
      withAiMeta(createMockMemory(input), {
        source: "mock",
        reason: "openai_parse_failed",
      }),
    );
  }
}

export async function GET() {
  const { env } = await getCloudflareContext({ async: true });
  const configured = Boolean(
    (env as unknown as { OPENAI_API_KEY?: string }).OPENAI_API_KEY,
  );
  return jsonRes({
    ok: true,
    service: "TripTrace.ai memory generation",
    provider: configured ? "OpenAI" : null,
    configured,
  });
}
