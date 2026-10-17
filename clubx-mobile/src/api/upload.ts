import { MOBILE_CLIENT_HEADER } from "@/config";
import { ApiError, fetchWithTimeout, getApiBaseUrl, getAuthToken } from "@/api/client";

/** Uploads a local image (file:// uri from the picker) and returns its public https URL. */
export async function uploadImage(uri: string, mimeType = "image/jpeg"): Promise<string> {
  const base = getApiBaseUrl();
  if (!base) throw new Error("uploadImage called before a club was selected");
  const token = getAuthToken();
  const form = new FormData();
  const ext = mimeType.split("/")[1] ?? "jpg";
  // React Native's FormData accepts { uri, name, type } for files.
  form.append("file", { uri, name: `avatar.${ext}`, type: mimeType } as unknown as Blob);
  const res = await fetchWithTimeout(`${base}/api/upload`, {
    method: "POST",
    headers: { ...MOBILE_CLIENT_HEADER, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: form,
  });
  const body = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
  if (!res.ok || !body?.url) throw new ApiError(body?.error ?? `Téléversement impossible (${res.status})`, res.status, null);
  return body.url;
}
