// Ported from public/app.js: extractPartialJson, fetchMemoryStream, filterAbstractTags.
import type { GenerateResult } from "./memory-types";

const ABSTRACT_TAG_PATTERN =
  /^(温暖|珍贵|意义|成长|平静|感动|美好|难忘|幸福|感谢|独处|治愈|记忆|情感|心情|值得|保存|时光|岁月|青春|人生|生活|旅途|感悟|思念|想念|陪伴|爱|快乐|满足|充实|感恩|放松|自由|勇气|坚持|努力|梦想|希望|未来|过去|当下|瞬间|永远|一直|总是)$/;

export function filterAbstractTags(tags: string[]): string[] {
  return tags.filter((tag) => !ABSTRACT_TAG_PATTERN.test(tag.trim()));
}

export function extractPartialJson(raw: string): GenerateResult {
  const result: GenerateResult = {};

  const titleM = raw.match(/"title"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (titleM) result.title = titleM[1].replace(/\\n/g, "\n").replace(/\\"/g, '"');

  const storyStart = raw.indexOf('"story"');
  if (storyStart !== -1) {
    const quoteIdx = raw.indexOf('"', storyStart + 7);
    if (quoteIdx !== -1) {
      let story = "";
      let i = quoteIdx + 1;
      while (i < raw.length) {
        if (raw[i] === "\\" && i + 1 < raw.length) {
          const esc = raw[i + 1];
          if (esc === "n") story += "\n";
          else if (esc === '"') story += '"';
          else story += esc;
          i += 2;
        } else if (raw[i] === '"') {
          break;
        } else {
          story += raw[i];
          i++;
        }
      }
      if (story.length > 0) result.story = story;
    }
  }

  const tagsM = raw.match(/"tags"\s*:\s*\[([^\]]+)\]/);
  if (tagsM) {
    const rawTags =
      tagsM[1].match(/"((?:[^"\\]|\\.)*)"/g)?.map((s) => s.slice(1, -1).replace(/\\"/g, '"')) ?? [];
    result.tags = filterAbstractTags(rawTags);
  }

  return result;
}

export type GenerateInput = {
  moment: string;
  place?: string;
  mood?: string;
  moodLabel?: string;
};

export async function fetchMemoryStream(
  payload: GenerateInput,
  onPartial: (partial: GenerateResult) => void,
): Promise<GenerateResult> {
  const response = await fetch("/api/generate-memory", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, stream: true }),
  });
  if (!response.ok || !response.body) throw new Error("stream failed");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let accumulated = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]") continue;
      try {
        const evt = JSON.parse(data);
        const delta: string = evt.delta ?? evt.output?.[0]?.content?.[0]?.text ?? "";
        if (delta) {
          accumulated += delta;
          const partial = extractPartialJson(accumulated);
          if (partial.title || partial.story) onPartial(partial);
        }
      } catch {
        // ignore malformed SSE line
      }
    }
  }

  try {
    const final = JSON.parse(accumulated);
    if (Array.isArray(final.tags)) final.tags = filterAbstractTags(final.tags);
    return { ...final, ai: { source: "openai" } };
  } catch {
    throw new Error("stream parse failed");
  }
}
