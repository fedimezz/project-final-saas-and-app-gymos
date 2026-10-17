import { apiDelete, apiGet, apiPost } from "@/api/client";
import type { Post, PostComment } from "@/api/types";

// GET /api/posts returns a bare array, not { posts: [...] } — matches the
// backend route exactly (see app/api/posts/route.ts in the web repo).
export function fetchPosts(): Promise<Post[]> {
  return apiGet<Post[]>("/api/posts");
}

export function togglePostLike(postId: string): Promise<{ liked: boolean }> {
  return apiPost<{ liked: boolean }>(`/api/posts/${encodeURIComponent(postId)}/like`);
}

export function addPostComment(postId: string, content: string): Promise<PostComment> {
  return apiPost<PostComment>(`/api/posts/${encodeURIComponent(postId)}/comments`, { content });
}

// DELETE /api/posts/[id]/comments { commentId } — the author can delete their own comment.
export function deletePostComment(postId: string, commentId: string): Promise<{ success: boolean }> {
  return apiDelete<{ success: boolean }>(`/api/posts/${encodeURIComponent(postId)}/comments`, { commentId });
}
