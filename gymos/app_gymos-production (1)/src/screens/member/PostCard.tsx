import { useState } from "react";
import { Image, Pressable, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/auth/AuthContext";
import { addPostComment, togglePostLike } from "@/api/posts";
import type { Post, PostComment } from "@/api/types";
import Avatar from "@/components/Avatar";
import Badge from "@/components/Badge";
import Card from "@/components/Card";
import { ApiError } from "@/api/client";
import { useTheme, spacing, radius, typography } from "@/theme/ThemeContext";
import { timeAgo } from "@/lib/dates";

/** News post with like and comment actions backed by the club API. */
export default function PostCard({ post, now }: { post: Post; now: Date }) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [liked, setLiked] = useState(post.likes.some((like) => like.userId === user?.id));
  const [likeCount, setLikeCount] = useState(post.likes.length);
  const [comments, setComments] = useState(post.comments);
  const [commentText, setCommentText] = useState("");
  const [submittingLike, setSubmittingLike] = useState(false);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLike = async () => {
    if (submittingLike) return;
    setSubmittingLike(true);
    setError(null);
    try {
      const result = await togglePostLike(post.id);
      setLiked(result.liked);
      setLikeCount((count) => Math.max(0, count + (result.liked ? 1 : -1)));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Impossible d’enregistrer votre j’aime. Réessayez.");
    } finally {
      setSubmittingLike(false);
    }
  };

  const handleComment = async () => {
    const content = commentText.trim();
    if (!content || submittingComment) return;
    setSubmittingComment(true);
    setError(null);
    try {
      const comment: PostComment = await addPostComment(post.id, content);
      setComments((current) => [...current, comment]);
      setCommentText("");
      setShowComments(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Impossible d’envoyer le commentaire. Réessayez.");
    } finally {
      setSubmittingComment(false);
    }
  };

  return (
    <Card style={{ gap: spacing.md }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <Avatar name={post.author.name} uri={post.author.avatar} size={38} />
        <View style={{ flex: 1 }}>
          <Text style={[typography.caption, { color: colors.text, fontWeight: "700" }]}>{post.author.name}</Text>
          <Text style={[typography.small, { color: colors.textMuted }]}>{timeAgo(new Date(post.createdAt), now)}</Text>
        </View>
      </View>

      {post.mediaType === "image" && post.mediaUrl ? (
        <Image
          source={{ uri: post.mediaUrl }}
          accessibilityLabel={post.title ?? "Image de l’actualité"}
          style={{ width: "100%", height: 190, borderRadius: radius.md, backgroundColor: colors.border }}
          resizeMode="cover"
        />
      ) : post.mediaType ? (
        <Badge label={post.mediaType === "video" ? "Vidéo disponible sur le site" : "Audio disponible sur le site"} tone="neutral" />
      ) : null}

      {post.title ? <Text style={[typography.h2, { color: colors.text }]}>{post.title}</Text> : null}
      <Pressable
        onPress={() => setExpanded((value) => !value)}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={expanded ? "Réduire l’actualité" : "Lire l’actualité complète"}
      >
        <Text style={[typography.body, { color: colors.text }]} numberOfLines={expanded ? undefined : 3}>
          {post.content}
        </Text>
        {post.content.length > 140 ? (
          <Text style={[typography.caption, { color: colors.primary, marginTop: spacing.xs }]}>
            {expanded ? "Voir moins" : "Lire la suite"}
          </Text>
        ) : null}
      </Pressable>

      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
        <Pressable
          onPress={() => void handleLike()}
          disabled={submittingLike}
          accessibilityRole="button"
          accessibilityLabel={liked ? "Retirer votre j’aime" : "Aimer cette actualité"}
          accessibilityState={{ disabled: submittingLike, selected: liked }}
          style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: spacing.xs, paddingHorizontal: spacing.sm }}
        >
          <Ionicons name={liked ? "heart" : "heart-outline"} size={20} color={liked ? colors.danger : colors.textMuted} />
          <Text style={[typography.caption, { color: liked ? colors.danger : colors.textMuted }]}>{likeCount}</Text>
        </Pressable>
        <Pressable
          onPress={() => setShowComments((value) => !value)}
          accessibilityRole="button"
          accessibilityState={{ expanded: showComments }}
          accessibilityLabel={`${showComments ? "Masquer" : "Afficher"} ${comments.length} commentaires`}
          style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: spacing.xs, paddingHorizontal: spacing.sm }}
        >
          <Ionicons name="chatbubble-outline" size={18} color={colors.textMuted} />
          <Text style={[typography.caption, { color: colors.textMuted }]}>{comments.length}</Text>
        </Pressable>
      </View>

      {showComments ? (
        <View style={{ gap: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md }}>
          {comments.length === 0 ? (
            <Text style={[typography.caption, { color: colors.textMuted }]}>Aucun commentaire. Soyez le premier à répondre.</Text>
          ) : (
            comments.map((comment) => <CommentRow key={comment.id} comment={comment} colors={colors} />)
          )}

          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: spacing.sm }}>
            <TextInput
              value={commentText}
              onChangeText={setCommentText}
              placeholder="Écrire un commentaire…"
              placeholderTextColor={colors.textMuted}
              selectionColor={colors.primary}
              accessibilityLabel="Écrire un commentaire"
              maxLength={1000}
              multiline
              editable={!submittingComment}
              textAlignVertical="top"
              style={{
                flex: 1,
                maxHeight: 120,
                minHeight: 44,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: radius.md,
                backgroundColor: colors.surface,
                color: colors.text,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm,
                fontSize: 15,
              }}
            />
            <Pressable
              onPress={() => void handleComment()}
              disabled={!commentText.trim() || submittingComment}
              accessibilityRole="button"
              accessibilityLabel="Envoyer le commentaire"
              accessibilityState={{ disabled: !commentText.trim() || submittingComment, busy: submittingComment }}
              style={({ pressed }) => ({
                width: 44,
                height: 44,
                borderRadius: radius.pill,
                backgroundColor: colors.primary,
                alignItems: "center",
                justifyContent: "center",
                opacity: !commentText.trim() || submittingComment ? 0.5 : pressed ? 0.75 : 1,
              })}
            >
              <Ionicons name="send" size={18} color={colors.primaryText} />
            </Pressable>
          </View>
          <Text style={[typography.small, { color: colors.textMuted, textAlign: "right" }]}>{commentText.length}/1000</Text>
        </View>
      ) : null}

      {error ? (
        <Text accessibilityLiveRegion="polite" style={[typography.caption, { color: colors.danger }]}>
          {error}
        </Text>
      ) : null}
    </Card>
  );
}

function CommentRow({ comment, colors }: { comment: PostComment; colors: ReturnType<typeof useTheme>["colors"] }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: spacing.sm }}>
      <Avatar name={comment.user.name} uri={comment.user.avatar} size={30} />
      <View style={{ flex: 1, gap: 2, backgroundColor: colors.background, borderRadius: radius.md, padding: spacing.sm }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.xs }}>
          <Text style={[typography.caption, { color: colors.text, fontWeight: "700", flexShrink: 1 }]} numberOfLines={1}>
            {comment.user.name}
          </Text>
          <Text style={[typography.small, { color: colors.textMuted }]}>{timeAgo(new Date(comment.createdAt), new Date())}</Text>
        </View>
        <Text style={[typography.body, { color: colors.text }]}>{comment.content}</Text>
      </View>
    </View>
  );
}
