"use client";

import { useState, useEffect, useCallback } from "react";
import {
  PlusCircle, Trash2, Edit2, X, ImageIcon, Video, Music2,
  Heart, MessageCircle, Send, ChevronDown, ChevronUp,
  Eye, EyeOff, Loader2, AlertCircle, Megaphone,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

// ─── Types ───────────────────────────────────────────────────────────────────

type MediaType = "image" | "video" | "audio";

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
  mediaType?: MediaType;
  musicUrl?: string;
  isPublished: boolean;
  createdAt: string;
  author: Author;
  likes: { userId: string }[];
  comments: CommentType[];
}

interface FormState {
  title: string;
  content: string;
  mediaUrl: string;
  mediaType: MediaType;
  musicUrl: string;
  isPublished: boolean;
}

const EMPTY_FORM: FormState = {
  title: "",
  content: "",
  mediaUrl: "",
  mediaType: "image",
  musicUrl: "",
  isPublished: true,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

// ─── Media Renderer ───────────────────────────────────────────────────────────

function MediaBlock({ post }: { post: Post }) {
  if (!post.mediaUrl) return null;

  if (post.mediaType === "image") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={post.mediaUrl}
        alt={post.title || "Post image"}
        className="w-full max-h-[420px] object-cover"
      />
    );
  }

  if (post.mediaType === "video") {
    return (
      <div>
        <video src={post.mediaUrl} controls className="w-full max-h-[420px] bg-black" />
        {post.musicUrl && (
          <div className="flex items-center gap-3 px-4 py-2 bg-[var(--bg-secondary)] border-t border-[var(--border)]">
            <Music2 className="h-4 w-4 text-[var(--primary)] flex-shrink-0" />
            <span className="text-xs text-[var(--text-muted)] mr-2">Musique</span>
            <audio src={post.musicUrl} controls className="flex-1 h-7" />
          </div>
        )}
      </div>
    );
  }

  if (post.mediaType === "audio") {
    return (
      <div className="px-4 py-3 bg-[var(--bg-secondary)] flex items-center gap-3">
        <Music2 className="h-5 w-5 text-[var(--primary)] flex-shrink-0" />
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
  onEdit,
  onDelete,
  onLike,
  onComment,
  onDeleteComment,
  onTogglePublish,
}: {
  post: Post;
  currentUserId?: string;
  onEdit: (p: Post) => void;
  onDelete: (id: string) => void;
  onLike: (id: string) => void;
  onComment: (id: string, content: string) => void;
  onDeleteComment: (postId: string, commentId: string) => void;
  onTogglePublish: (id: string, current: boolean) => void;
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
    <article className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between px-5 pt-4 pb-3">
        <div className="flex items-center gap-3">
          <Avatar name={post.author.name} />
          <div>
            <p className="font-semibold text-[var(--text-primary)] text-sm leading-tight">
              {post.author.name}
            </p>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">{formatDate(post.createdAt)}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {!post.isPublished && (
            <span className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-2 py-0.5 rounded-full font-medium mr-1">
              Brouillon
            </span>
          )}
          <button
            onClick={() => onTogglePublish(post.id, post.isPublished)}
            title={post.isPublished ? "Masquer" : "Publier"}
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--primary)] hover:bg-[var(--bg-secondary)] transition"
          >
            {post.isPublished ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          </button>
          <button
            onClick={() => onEdit(post)}
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition"
          >
            <Edit2 className="h-4 w-4" />
          </button>
          <button
            onClick={() => onDelete(post.id)}
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="px-5 pb-3">
        {post.title && (
          <h3 className="font-bold text-[var(--text-primary)] text-base mb-1">{post.title}</h3>
        )}
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed whitespace-pre-line">
          {post.content}
        </p>
      </div>

      {/* Media */}
      <MediaBlock post={post} />

      {/* Stats bar */}
      <div className="flex items-center gap-1 px-5 py-2 border-t border-[var(--border)]">
        {post.likes.length > 0 && (
          <span className="text-xs text-[var(--text-muted)] mr-auto">
            {post.likes.length} j&apos;aime · {post.comments.length} commentaire{post.comments.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Action bar */}
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

      {/* Comments */}
      {showComments && (
        <div className="bg-[var(--bg-secondary)] border-t border-[var(--border)] px-5 py-4 space-y-3">
          {/* List */}
          <div className="space-y-2.5 max-h-64 overflow-y-auto">
            {post.comments.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)] text-center py-3">
                Aucun commentaire pour l&apos;instant
              </p>
            ) : (
              post.comments.map((c) => (
                <div key={c.id} className="flex gap-2 group">
                  <Avatar name={c.user.name} size="sm" />
                  <div className="flex-1 bg-[var(--bg-card)] rounded-xl px-3 py-2">
                    <span className="text-xs font-semibold text-[var(--text-primary)]">
                      {c.user.name}{" "}
                    </span>
                    <span className="text-xs text-[var(--text-secondary)]">{c.content}</span>
                  </div>
                  <button
                    onClick={() => onDeleteComment(post.id, c.id)}
                    className="opacity-0 group-hover:opacity-100 self-center p-1 rounded text-[var(--text-muted)] hover:text-red-500 transition"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
          {/* Input */}
          <div className="flex gap-2 pt-1">
            <input
              type="text"
              placeholder="Écrire un commentaire…"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleComment()}
              className="flex-1 px-3 py-2 rounded-full text-sm bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40"
            />
            <button
              onClick={handleComment}
              disabled={!commentText.trim() || submitting}
              className="p-2 rounded-full bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] transition disabled:opacity-40"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

// ─── Post Form Modal ──────────────────────────────────────────────────────────

function PostFormModal({
  editPost,
  onClose,
  onSaved,
}: {
  editPost: Post | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FormState>(
    editPost
      ? {
          title: editPost.title || "",
          content: editPost.content,
          mediaUrl: editPost.mediaUrl || "",
          mediaType: editPost.mediaType || "image",
          musicUrl: editPost.musicUrl || "",
          isPublished: editPost.isPublished,
        }
      : EMPTY_FORM
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>("");

  const set = (k: keyof FormState, v: string | boolean | MediaType) =>
    setForm((f) => ({ ...f, [k]: v }));

  // Lets the admin pick a file straight from their device/gallery instead
  // of pasting a URL. Uploads to /api/upload (which now actually saves the
  // file — see app/api/upload/route.ts), then fills mediaUrl + mediaType
  // from the response.
  const handleFileSelect = async (file: File | undefined | null) => {
    if (!file) return;
    setError("");
    setUploading(true);
    setUploadProgress(`Envoi de "${file.name}"…`);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/upload", {
        method: "POST",
        credentials: "include",
        body,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Échec du téléversement");
        return;
      }
      setForm((f) => ({ ...f, mediaUrl: data.url, mediaType: data.mediaType as MediaType }));
    } catch {
      setError("Erreur réseau lors du téléversement");
    } finally {
      setUploading(false);
      setUploadProgress("");
    }
  };

  const handleSubmit = async () => {
    if (!form.content.trim()) { setError("Le contenu est requis."); return; }
    if (uploading) { setError("Merci d'attendre la fin du téléversement du fichier."); return; }
    setSaving(true);
    setError("");
    try {
      const method = editPost ? "PATCH" : "POST";
      const url = editPost ? `/api/posts/${editPost.id}` : "/api/posts";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          ...form,
          mediaUrl: form.mediaUrl.trim() || undefined,
          musicUrl: form.musicUrl.trim() || undefined,
          title: form.title.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error || "Erreur serveur");
      } else {
        onSaved();
        onClose();
      }
    } catch {
      setError("Erreur réseau");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Modal header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
          <h2 className="font-bold text-[var(--text-primary)]">
            {editPost ? "Modifier l'annonce" : "Nouvelle annonce"}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--bg-secondary)] text-[var(--text-muted)] transition">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400 px-3 py-2 rounded-lg">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5 uppercase tracking-wide">
              Titre <span className="font-normal">(optionnel)</span>
            </label>
            <input
              type="text"
              placeholder="Ex: Nouvelle classe de yoga disponible !"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40"
            />
          </div>

          {/* Content */}
          <div>
            <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5 uppercase tracking-wide">
              Contenu <span className="text-red-500">*</span>
            </label>
            <textarea
              placeholder="Partagez une actualité, un événement ou une annonce…"
              value={form.content}
              onChange={(e) => set("content", e.target.value)}
              rows={5}
              className="w-full px-3 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40"
            />
          </div>

          {/* Media type */}
          <div>
            <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5 uppercase tracking-wide">
              Type de média
            </label>
            <div className="flex gap-2">
              {(["image", "video", "audio"] as MediaType[]).map((t) => {
                const Icon = t === "image" ? ImageIcon : t === "video" ? Video : Music2;
                const label = t === "image" ? "Image" : t === "video" ? "Vidéo" : "Audio";
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => set("mediaType", t)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold border transition ${
                      form.mediaType === t
                        ? "bg-[var(--primary)] border-[var(--primary)] text-white"
                        : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--primary)] hover:text-[var(--primary)] bg-[var(--bg-secondary)]"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" /> {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Media file — import from gallery */}
          <div>
            <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5 uppercase tracking-wide">
              Fichier {form.mediaType === "image" ? "image" : form.mediaType === "video" ? "vidéo" : "audio"}
              <span className="font-normal"> (optionnel)</span>
            </label>

            <label
              className={`flex items-center justify-center gap-2 w-full px-3 py-3 rounded-xl border-2 border-dashed cursor-pointer text-sm font-medium transition
                ${uploading
                  ? "border-[var(--primary)]/40 text-[var(--primary)] bg-[var(--primary)]/5 pointer-events-none"
                  : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--primary)] hover:text-[var(--primary)] hover:bg-[var(--primary)]/5"}`}
            >
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> {uploadProgress || "Envoi en cours…"}
                </>
              ) : (
                <>
                  {form.mediaType === "image" && <ImageIcon className="h-4 w-4" />}
                  {form.mediaType === "video" && <Video className="h-4 w-4" />}
                  {form.mediaType === "audio" && <Music2 className="h-4 w-4" />}
                  Importer depuis la galerie…
                </>
              )}
              <input
                type="file"
                accept={
                  form.mediaType === "image"
                    ? "image/*"
                    : form.mediaType === "video"
                    ? "video/*"
                    : "audio/*"
                }
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  handleFileSelect(file);
                  e.target.value = ""; // allow re-selecting the same file later
                }}
              />
            </label>

            {/* Preview of whatever is currently set (uploaded or manual URL) */}
            {form.mediaUrl && (
              <div className="mt-2 relative rounded-xl overflow-hidden border border-[var(--border)] bg-[var(--bg-secondary)]">
                {form.mediaType === "image" && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={form.mediaUrl} alt="Aperçu" className="w-full max-h-52 object-cover" />
                )}
                {form.mediaType === "video" && (
                  <video src={form.mediaUrl} controls className="w-full max-h-52 bg-black" />
                )}
                {form.mediaType === "audio" && (
                  <audio src={form.mediaUrl} controls className="w-full m-2" />
                )}
                <button
                  type="button"
                  onClick={() => set("mediaUrl", "")}
                  className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 text-white hover:bg-black/80"
                  title="Retirer le média"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* Manual URL fallback, e.g. for media already hosted elsewhere */}
            <details className="mt-2">
              <summary className="text-xs text-[var(--text-muted)] cursor-pointer hover:text-[var(--primary)]">
                Ou coller un lien manuellement
              </summary>
              <input
                type="url"
                placeholder={
                  form.mediaType === "image"
                    ? "https://… .jpg / .png / .webp"
                    : form.mediaType === "video"
                    ? "https://… .mp4"
                    : "https://… .mp3"
                }
                value={form.mediaUrl}
                onChange={(e) => set("mediaUrl", e.target.value)}
                className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40"
              />
            </details>
          </div>

          {/* Music URL — only for video */}
          {form.mediaType === "video" && (
            <div>
              <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5 uppercase tracking-wide">
                Musique de fond <span className="font-normal">(optionnel — mp3)</span>
              </label>
              <input
                type="url"
                placeholder="https://… .mp3"
                value={form.musicUrl}
                onChange={(e) => set("musicUrl", e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40"
              />
            </div>
          )}

          {/* Published toggle */}
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <div
              onClick={() => set("isPublished", !form.isPublished)}
              className={`relative w-10 h-5 rounded-full transition-colors ${
                form.isPublished ? "bg-[var(--primary)]" : "bg-[var(--border)]"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                  form.isPublished ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </div>
            <span className="text-sm text-[var(--text-secondary)]">
              {form.isPublished ? "Publié immédiatement" : "Sauvegarder comme brouillon"}
            </span>
          </label>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={!form.content.trim() || saving}
            className="w-full py-2.5 bg-[var(--primary)] text-white rounded-xl font-semibold text-sm hover:bg-[var(--primary-hover)] transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {editPost ? "Enregistrer les modifications" : "Publier l'annonce"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminNewsPage() {
  const { user } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editPost, setEditPost] = useState<Post | null>(null);
  const [filter, setFilter] = useState<"all" | "published" | "draft">("all");

  const fetchPosts = useCallback(async () => {
    try {
      const res = await fetch("/api/posts", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setPosts(data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  const handleDelete = async (id: string) => {
    if (!confirm("Supprimer ce post définitivement ?")) return;
    await fetch(`/api/posts/${id}`, { method: "DELETE", credentials: "include" });
    setPosts((p) => p.filter((x) => x.id !== id));
  };

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

  const handleDeleteComment = async (postId: string, commentId: string) => {
    await fetch(`/api/posts/${postId}/comments`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
        credentials: "include",
      body: JSON.stringify({ commentId }),
    });
    fetchPosts();
  };

  const handleTogglePublish = async (id: string, current: boolean) => {
    await fetch(`/api/posts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
        credentials: "include",
      body: JSON.stringify({ isPublished: !current }),
    });
    fetchPosts();
  };

  const openEdit = (post: Post) => {
    setEditPost(post);
    setShowForm(true);
  };

  const filteredPosts = posts.filter((p) => {
    if (filter === "published") return p.isPublished;
    if (filter === "draft") return !p.isPublished;
    return true;
  });

  const stats = {
    total: posts.length,
    published: posts.filter((p) => p.isPublished).length,
    totalLikes: posts.reduce((acc, p) => acc + p.likes.length, 0),
    totalComments: posts.reduce((acc, p) => acc + p.comments.length, 0),
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2">
            <Megaphone className="h-6 w-6 text-[var(--primary)]" />
            Annonces & Actualités
          </h1>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">
            Publiez des actualités, événements et annonces pour les membres
          </p>
        </div>
        <button
          onClick={() => { setEditPost(null); setShowForm(true); }}
          className="flex items-center gap-2 bg-[var(--primary)] text-white px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-[var(--primary-hover)] transition shadow-sm"
        >
          <PlusCircle className="h-4 w-4" />
          Nouvelle annonce
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total posts", value: stats.total },
          { label: "Publiés", value: stats.published },
          { label: "J'aimes", value: stats.totalLikes },
          { label: "Commentaires", value: stats.totalComments },
        ].map((s) => (
          <div
            key={s.label}
            className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl px-4 py-3 text-center"
          >
            <p className="text-2xl font-bold text-[var(--text-primary)]">{s.value}</p>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 bg-[var(--bg-secondary)] p-1 rounded-xl w-fit">
        {(["all", "published", "draft"] as const).map((f) => {
          const labels = { all: "Tous", published: "Publiés", draft: "Brouillons" };
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${
                filter === f
                  ? "bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              {labels[f]}
            </button>
          );
        })}
      </div>

      {/* Feed */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--primary)]" />
        </div>
      ) : filteredPosts.length === 0 ? (
        <div className="text-center py-20 bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl">
          <Megaphone className="h-10 w-10 text-[var(--text-muted)] mx-auto mb-3 opacity-40" />
          <p className="text-[var(--text-muted)] font-medium">Aucune annonce pour l&apos;instant</p>
          <p className="text-sm text-[var(--text-muted)] opacity-70 mt-1">
            Créez votre première annonce pour informer les membres
          </p>
          <button
            onClick={() => { setEditPost(null); setShowForm(true); }}
            className="mt-4 text-sm text-[var(--primary)] font-semibold hover:underline"
          >
            Créer une annonce →
          </button>
        </div>
      ) : (
        <div className="max-w-2xl space-y-5">
          {filteredPosts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              currentUserId={user?.id}
              onEdit={openEdit}
              onDelete={handleDelete}
              onLike={handleLike}
              onComment={handleComment}
              onDeleteComment={handleDeleteComment}
              onTogglePublish={handleTogglePublish}
            />
          ))}
        </div>
      )}

      {/* Form modal */}
      {showForm && (
        <PostFormModal
          editPost={editPost}
          onClose={() => { setShowForm(false); setEditPost(null); }}
          onSaved={fetchPosts}
        />
      )}
    </div>
  );
}