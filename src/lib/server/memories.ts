// Shared helpers for /api/memories — schema assumed current (migrations 0001-0006 applied).
export function safeParseArray(value: unknown): string[] {
  try {
    const arr = JSON.parse(String(value ?? "[]"));
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function buildMediaUrl(key: string): string {
  return `/api/media?key=${encodeURIComponent(String(key || "").trim())}`;
}

export type MemoryRow = {
  id: string;
  title: string;
  story: string;
  place: string | null;
  mood: string | null;
  tags_json: string;
  photo_keys_json: string | null;
  cover_photo_key: string | null;
  is_public: number;
  created_at: string;
  user_id: string;
  display_name: string;
};

export function rowToMemory(row: MemoryRow) {
  return {
    id: row.id,
    title: row.title,
    story: row.story,
    place: row.place,
    mood: row.mood,
    tags: safeParseArray(row.tags_json),
    photoKeys: safeParseArray(row.photo_keys_json),
    photoUrls: safeParseArray(row.photo_keys_json).map(buildMediaUrl),
    coverPhotoKey: row.cover_photo_key,
    coverPhotoUrl: row.cover_photo_key ? buildMediaUrl(row.cover_photo_key) : null,
    isPublic: row.is_public !== 0,
    createdAt: row.created_at,
    user: { id: row.user_id, displayName: row.display_name },
  };
}
