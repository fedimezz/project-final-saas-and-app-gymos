"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Heart, MessageCircle, Send, ChevronDown, ChevronUp,
  Music2, Loader2, Megaphone,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import PagePublishGate from "@/components/layout/PagePublishGate";
import { useEditableContent } from "@/hooks/useEditableContent";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Author {
  id: string;
  name: string;
  avatar?: string;
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const cls =
    size === "lg" ? "h-11 w-11 text-base" :
    size === "sm" ? "h-7 w-7 text-xs" :
    "h-9 w-9 text-sm";
  return (
    <div className={`${cls} rounded-full bg-green-600 flex items-center justify-center text-white font-bold flex-shrink-0`}>
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

// ─── Media ───────────────────────────────────────────────────────────────────

function MediaBlock({ post }: { post: Post }) {
  if (!post.mediaUrl) return null;

  if (post.mediaType === "image") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={post.mediaUrl} alt={post.title || "Post"} className="w-full max-h-[480px] object-cover" />
    );
  }

  if (post.mediaType === "video") {
    return (
      <div>
        <video src={post.mediaUrl} controls className="w-full max-h-[480px] bg-black" />
        {post.musicUrl && (
          <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 dark:bg-neutral-800 border-t border-gray-100 dark:border-neutral-700">
            <Music2 className="h-4 w-4 text-green-600 flex-shrink-0" />
            <span className="text-xs text-gray-500 mr-1">Musique</span>
            <audio src={post.musicUrl} controls className="flex-1 h-7" />
          </div>
        )}
      </div>
    );
  }

  if (post.mediaType === "audio") {
    return (
      <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 dark:bg-neutral-800">
        <Music2 className="h-5 w-5 text-green-600 flex-shrink-0" />
        <audio src={post.mediaUrl} controls className="flex-1" />
      </div>
    );
  }

  return null;
}

// ─── Post Card ───────────────────────────────────────────────────────────────

function PostCard({
  post,
  currentUserId,
  isLoggedIn,
  onLike,
  onComment,
}: {
  post: Post;
  currentUserId?: string;
  isLoggedIn: boolean;
  onLike: (id: string) => void;
  onComment: (id: string, content: string) => Promise<void>;
}) {
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const liked = post.likes.some((l) => l.userId === currentUserId);

  const handleComment = async () => {
    if (!commentText.trim() || !isLoggedIn) return;
    setSubmitting(true);
    await onComment(post.id, commentText.trim());
    setCommentText("");
    setSubmitting(false);
  };

  return (
    <article className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-4 pb-3">
        <Avatar name={post.author.name} />
        <div>
          <p className="font-semibold text-gray-900 dark:text-white text-sm">{post.author.name}</p>
          <p className="text-xs text-gray-400 dark:text-neutral-500 mt-0.5">{formatDate(post.createdAt)}</p>
        </div>
      </div>

      {/* Content */}
      <div className="px-5 pb-4">
        {post.title && (
          <h2 className="font-bold text-gray-900 dark:text-white text-lg mb-1.5 leading-snug">{post.title}</h2>
        )}
        <p className="text-sm text-gray-700 dark:text-neutral-300 leading-relaxed whitespace-pre-line">
          {post.content}
        </p>
      </div>

      {/* Media */}
      <MediaBlock post={post} />

      {/* Stats */}
      {(post.likes.length > 0 || post.comments.length > 0) && (
        <div className="px-5 py-2 flex items-center gap-3 text-xs text-gray-400 dark:text-neutral-500 border-t border-gray-100 dark:border-neutral-800">
          {post.likes.length > 0 && (
            <span>❤️ {post.likes.length} j&apos;aime</span>
          )}
          {post.comments.length > 0 && (
            <span>· {post.comments.length} commentaire{post.comments.length !== 1 ? "s" : ""}</span>
          )}
        </div>
      )}

      {/* Action bar */}
      <div className="flex border-t border-gray-100 dark:border-neutral-800">
        <button
          onClick={() => isLoggedIn && onLike(post.id)}
          disabled={!isLoggedIn}
          title={!isLoggedIn ? "Connectez-vous pour aimer" : ""}
          className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition ${
            liked
              ? "text-red-500"
              : isLoggedIn
              ? "text-gray-500 dark:text-neutral-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10"
              : "text-gray-300 dark:text-neutral-700 cursor-not-allowed"
          }`}
        >
          <Heart className={`h-4 w-4 ${liked ? "fill-red-500" : ""}`} />
          J&apos;aime
        </button>
        <div className="w-px bg-gray-100 dark:bg-neutral-800" />
        <button
          onClick={() => setShowComments((s) => !s)}
          className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium text-gray-500 dark:text-neutral-400 hover:bg-gray-50 dark:hover:bg-neutral-800 transition"
        >
          <MessageCircle className="h-4 w-4" />
          Commenter
          {showComments ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
      </div>

      {/* Comments */}
      {showComments && (
        <div className="bg-gray-50 dark:bg-neutral-900 border-t border-gray-100 dark:border-neutral-800 px-5 py-4 space-y-3">
          <div className="space-y-2.5 max-h-72 overflow-y-auto">
            {post.comments.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">Soyez le premier à commenter</p>
            ) : (
              post.comments.map((c) => (
                <div key={c.id} className="flex gap-2">
                  <Avatar name={c.user.name} size="sm" />
                  <div className="flex-1 bg-white dark:bg-neutral-800 rounded-xl px-3 py-2 border border-gray-100 dark:border-neutral-700">
                    <span className="text-xs font-semibold text-gray-800 dark:text-neutral-200">
                      {c.user.name}{" "}
                    </span>
                    <span className="text-xs text-gray-600 dark:text-neutral-300">{c.content}</span>
                    <p className="text-[10px] text-gray-400 dark:text-neutral-500 mt-0.5">
                      {new Date(c.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>

          {isLoggedIn ? (
            <div className="flex gap-2 pt-1">
              <input
                type="text"
                placeholder="Écrire un commentaire…"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleComment()}
                className="flex-1 px-4 py-2.5 rounded-full text-sm bg-white dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500/30"
              />
              <button
                onClick={handleComment}
                disabled={!commentText.trim() || submitting}
                className="p-2.5 rounded-full bg-green-600 text-white hover:bg-green-700 transition disabled:opacity-40"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
          ) : (
            <p className="text-xs text-center text-gray-400 py-2">
              <a href="/user/login" className="text-green-600 font-medium hover:underline">
                Connectez-vous
              </a>{" "}
              pour laisser un commentaire
            </p>
          )}
        </div>
      )}
    </article>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ActualitesPage() {
  const { isLoggedIn, user } = useAuth();
  const { t, img } = useEditableContent("actualites");
  const heroImage = img("heroImage", "");
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPosts = useCallback(async () => {
    try {
      const res = await fetch("/api/posts");
      if (res.ok) {
        const data = await res.json();
        // Only show published posts to users
        setPosts((data as Post[]).filter((p) => p.isPublished));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  const handleLike = async (postId: string) => {
    if (!isLoggedIn) return;
    await fetch(`/api/posts/${postId}/like`, { method: "POST", credentials: "include" });
    fetchPosts();
  };

  const handleComment = async (postId: string, content: string) => {
    if (!isLoggedIn) return;
    await fetch(`/api/posts/${postId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ content }),
    });
    fetchPosts();
  };

  return (
    <PagePublishGate pageKey="actualites">
    <>
      {/* Hero */}
      <section className={`relative border-b border-gray-100 dark:border-neutral-800 py-10 px-4 overflow-hidden ${heroImage ? "" : "bg-white dark:bg-neutral-950"}`}>
        {heroImage && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={heroImage} alt="" className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/55" />
          </>
        )}
        <div className="relative max-w-2xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 px-3 py-1 rounded-full text-xs font-semibold mb-4">
            <Megaphone className="h-3.5 w-3.5" />
            Actualités du club
          </div>
          <h1 className={`text-3xl font-bold mb-2 ${heroImage ? "text-white" : "text-gray-900 dark:text-white"}`}>
            {t("heroTitle", "Restez informés")}
          </h1>
          <p className={`text-sm ${heroImage ? "text-white/85" : "text-gray-500 dark:text-neutral-400"}`}>
            {t("heroSubtitle", "Retrouvez toutes les dernières nouvelles, événements et annonces du club")}
          </p>
        </div>
      </section>

      {/* Feed */}
      <section className="max-w-2xl mx-auto px-4 py-8">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-green-600" />
          </div>
        ) : posts.length === 0 ? (
          <div className="text-center py-20 bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-2xl">
            <Megaphone className="h-10 w-10 text-gray-300 dark:text-neutral-600 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-neutral-400 font-medium">
              Aucune actualité publiée pour le moment
            </p>
            <p className="text-sm text-gray-400 dark:text-neutral-500 mt-1">
              Revenez bientôt pour les dernières nouvelles du club
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                currentUserId={user?.id}
                isLoggedIn={isLoggedIn}
                onLike={handleLike}
                onComment={handleComment}
              />
            ))}
          </div>
        )}
      </section>
    </>
    </PagePublishGate>
  );
}