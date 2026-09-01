export type AiMeta = {
  source: "openai" | "mock" | "local" | string;
  model?: string | null;
  reason?: string | null;
  generatedAt?: string | null;
};

export type Memory = {
  id?: string;
  title: string;
  story: string;
  place: string;
  mood: string;
  tags: string[];
  date: string;
  photoKeys: string[];
  photoUrls: string[];
  coverPhotoKey: string | null;
  coverPhotoUrl: string | null;
  ai: AiMeta;
  isPublic?: boolean;
  createdAt?: string;
  eventAt?: string | null;
  datePrecision?: "exact" | "day" | "month" | "year" | "approximate" | "unknown" | string;
  factualSummary?: string;
  people?: string[];
  latitude?: number | null;
  longitude?: number | null;
  factsConfirmedAt?: string | null;
  _local?: boolean;
  _cloud?: boolean;
  _sourceId?: string;
  _aiStory?: string;
  _aiTags?: string[];
};

export type GenerateResult = {
  title?: string;
  story?: string;
  tags?: string[];
  ai?: AiMeta;
};
