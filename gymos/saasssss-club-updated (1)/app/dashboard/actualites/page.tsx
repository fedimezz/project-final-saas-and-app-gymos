"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Heart, MessageCircle, Send, ChevronDown, ChevronUp,
  Music2, Loader2, Megaphone,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

interface Author {
  id: string;
  name: string;
}

interface CommentType {
  id: string;
  content: string;
  createdAt: string;
  user: Author;
}

interface Post {
  id: string;
  title?: string;
  content: string;
  mediaUrl?: string;
  mediaType?: "image" | "video" | "audio";
  musicUrl?: string;
  isPublished: boolean;
  createdAt: string;
  author: Author;
  likes: { userId: string }[];
  comments: CommentType[];
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  const cls = size === "sm" ? "h-7 w-7 text-xs" : "h-9 w-9 text-sm";
  return (
    <div className={`${cls} rounded-full bg-[var(--primary)] flex items-center justify-center text-white font-bold flex-shrink-0`}>
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

function MediaBlock({ post }: { post: Post }) {
  if (!post.mediaUrl) return null;
  if (post.mediaType === "image") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={post.mediaUrl} alt="" className="w-full max-h-[400px] object-cover" />;
  }
  if (post.mediaType === "video") {
    return (
      <div>
        <video src={post.mediaUrl} controls className="w-full max-h-[400px] bg-black" />
        {post.musicUrl && (
          <div className="flex items-center gap-3 px-4 py-2 bg-[var(--bg-secondary)] border-t border-[var(--border)]">
            <Music2 className="h-4 w-4 text-[var(--primary)] flex-shrink-0" />
            <audio src={post.musicUrl} controls className="flex-1 h-7" />
          </div>
        )}
      </div>
    );
  }
  if (post.mediaType === "audio") {
    return (
      <div className="flex items-center gap-3 px-4 py-3 bg-[var(--bg-secondary)]">
        <Music2 className="h-5 w-5 text-[var(--primary)]" />
        <audio src={post.mediaUrl} controls className="flex-1" />
      </div>
    );
  }
  return null;
}

function PostCard({
  post,
  currentUserId,
  onLike,
  onComment,
}: {
  post: Post;
  currentUserId?: string;
  onLike: (id: string) => void;
  onComment: (id: string, content: string) => Promise<void>;
}) {
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const liked = post.likes.some((l) => l.userId === currentUserId);

  const handleComment = async () => {
    if (!commentText.trim()) return;
    setSubmitting(true);
    await onComment(post.id, commentText.trim());
    setCommentText("");
    setSubmitting(false);
  };

  return (
    <article className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl overflow-hidden shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-4 pb-3">
        <Avatar name={post.author.name} />
        <div>
          <p className="font-semibold text-[var(--text-primary)] text-sm">{post.author.name}</p>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">{formatDate(post.createdAt)}</p>
        </div>
      </div>

      {/* Content */}
      <div className="px-5 pb-4">
        {post.title && (
          <h3 className="font-bold text-[var(--text-primary)] text-base mb-1.5">{post.title}</h3>
        )}
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed whitespace-pre-line">
          {post.content}
        </p>
      </div>

      <MediaBlock post={post} />

      {(post.likes.length > 0 || post.comments.length > 0) && (
        <div className="px-5 py-2 flex gap-3 text-xs text-[var(--text-muted)] border-t border-[var(--border)]">
          {post.likes.length > 0 && <span>❤️ {post.likes.length}</span>}
          {post.comments.length > 0 && <span>💬 {post.comments.length}</span>}
        </div>
      )}

      {/* Actions */}
      <div className="flex border-t border-[var(--border)]">
        <button
          onClick={() => onLike(post.id)}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition hover:bg-[var(--bg-secondary)] ${
            liked ? "text-red-500" : "text-[var(--text-muted)]"
          }`}
        >
          <Heart className={`h-4 w-4 ${liked ? "fill-red-500" : ""}`} />
          J&apos;aime
        </button>
        <div className="w-px bg-[var(--border)]" />
        <button
          onClick={() => setShowComments((s) => !s)}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium text-[var(--text-muted)] hover:bg-[var(--bg-secondary)] transition"
        >
          <MessageCircle className="h-4 w-4" />
          Commenter
          {showComments ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
      </div>

      {showComments && (
        <div className="bg-[var(--bg-secondary)] border-t border-[var(--border)] px-5 py-4 space-y-3">
          <div className="space-y-2.5 max-h-64 overflow-y-auto">
            {post.comments.length === 0 ? (
              <p className="text-xs text-center text-[var(--text-muted)] py-3">Soyez le premier à commenter</p>
            ) : (
              post.comments.map((c) => (
                <div key={c.id} className="flex gap-2">
                  <Avatar name={c.user.name} size="sm" />
                  <div className="flex-1 bg-[var(--bg-card)] rounded-xl px-3 py-2 border border-[var(--border)]">
                    <span className="text-xs font-semibold text-[var(--text-primary)]">{c.user.name} </span>
                    <span className="text-xs text-[var(--text-secondary)]">{c.content}</span>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="flex gap-2 pt-1">
            <input
              type="text"
              placeholder="Écrire un commentaire…"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleComment()}
              className="flex-1 px-4 py-2.5 rounded-full text-sm bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40"
            />
            <button
              onClick={handleComment}
              disabled={!commentText.trim() || submitting}
              className="p-2.5 rounded-full bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] transition disabled:opacity-40"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

export default function DashboardActualitesPage() {
  const { user } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPosts = useCallback(async () => {
    try {
      const res = await fetch("/api/posts");
      if (res.ok) {
        const data = await res.json();
        setPosts((data as Post[]).filter((p) => p.isPublished));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  const handleLike = async (postId: string) => {
    await fetch(`/api/posts/${postId}/like`, { method: "POST", credentials: "include" });
    fetchPosts();
  };

  const handleComment = async (postId: string, content: string) => {
    await fetch(`/api/posts/${postId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ content }),
    });
    fetchPosts();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2">
          <Megaphone className="h-6 w-6 text-[var(--primary)]" />
          Actualités
        </h1>
        <p className="text-sm text-[var(--text-muted)] mt-0.5">
          Les dernières nouvelles et annonces du club
        </p>
      </div>

      {/* Feed */}
      <div className="max-w-2xl space-y-5">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-[var(--primary)]" />
          </div>
        ) : posts.length === 0 ? (
          <div className="text-center py-20 bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl">
            <Megaphone className="h-10 w-10 text-[var(--text-muted)] mx-auto mb-3 opacity-40" />
            <p className="text-[var(--text-muted)] font-medium">Aucune actualité pour le moment</p>
            <p className="text-sm text-[var(--text-muted)] opacity-70 mt-1">
              Revenez bientôt pour les dernières nouvelles
            </p>
          </div>
        ) : (
          posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              currentUserId={user?.id}
              onLike={handleLike}
              onComment={handleComment}
            />
          ))
        )}
      </div>
    </div>
  );
}