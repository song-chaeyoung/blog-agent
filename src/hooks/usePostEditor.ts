import { useState, useCallback } from "react";
import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import type { ImageBlock } from "@/types/post";

type ReviewDraft = {
  kind: "review";
  blocks: ImageBlock[];
  intro: string;
  outro: string;
};

type PlainDraft = {
  kind: "plain";
  content: string;
};

type Draft = ReviewDraft | PlainDraft;

// ─── 훅 ───────────────────────────────────────────────────────────────────

/**
 * 포스트 상세 페이지의 편집/삭제/복사 상태를 관리하는 훅
 * - draft가 null이면 보기 모드, non-null이면 편집 모드
 */
export function usePostEditor(post: Doc<"posts">) {
  const router = useRouter();
  const updatePost = useMutation(api.posts.updatePost);
  const deletePost = useMutation(api.posts.deletePost);

  const isReviewPost = (post.imageBlocks?.length ?? 0) > 0;

  // draft가 null = 보기 모드 / non-null = 편집 모드
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [copied, setCopied] = useState(false);

  const editing = draft !== null;

  const startEdit = useCallback(() => {
    if (isReviewPost) {
      setDraft({
        kind: "review",
        blocks: post.imageBlocks ?? [],
        intro: post.intro ?? "",
        outro: post.outro ?? "",
      });
    } else {
      setDraft({ kind: "plain", content: post.content });
    }
  }, [post, isReviewPost]);

  const cancelEdit = useCallback(() => {
    setDraft(null);
  }, []);

  const updateCaption = useCallback((index: number, caption: string) => {
    setDraft((prev) => {
      if (!prev || prev.kind !== "review") return prev;
      const updated = [...prev.blocks];
      updated[index] = { ...updated[index], caption };
      return { ...prev, blocks: updated };
    });
  }, []);

  const updateIntro = useCallback((intro: string) => {
    setDraft((prev) => {
      if (!prev || prev.kind !== "review") return prev;
      return { ...prev, intro };
    });
  }, []);

  const updateOutro = useCallback((outro: string) => {
    setDraft((prev) => {
      if (!prev || prev.kind !== "review") return prev;
      return { ...prev, outro };
    });
  }, []);

  const updateContent = useCallback((content: string) => {
    setDraft((prev) => {
      if (!prev || prev.kind !== "plain") return prev;
      return { ...prev, content };
    });
  }, []);

  const handleSave = useCallback(async () => {
    if (!draft) return;
    setSaving(true);
    try {
      if (draft.kind === "review") {
        const parts: string[] = [];
        if (draft.intro) parts.push(draft.intro);
        draft.blocks.forEach((b) => {
          if (b.caption) parts.push(b.caption);
        });
        if (draft.outro) parts.push(draft.outro);
        await updatePost({
          postId: post._id,
          content: parts.join("\n\n"),
          imageBlocks: draft.blocks,
          intro: draft.intro,
          outro: draft.outro,
        });
      } else {
        await updatePost({ postId: post._id, content: draft.content });
      }
      setDraft(null);
      toast.success("저장되었습니다. 요약 재생성을 예약했습니다.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  }, [draft, post._id, updatePost]);

  const handleDelete = useCallback(async () => {
    if (!confirm("정말 이 글을 삭제하시겠습니까?")) return;
    setDeleting(true);
    try {
      await deletePost({ postId: post._id });
      router.push("/posts");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "삭제 중 오류가 발생했습니다.");
    } finally {
      setDeleting(false);
    }
  }, [post._id, deletePost, router]);

  const handleCopy = useCallback(async () => {
    let text: string;
    if (draft) {
      text =
        draft.kind === "review"
          ? draft.blocks.map((b) => b.caption).join("\n\n")
          : draft.content;
    } else {
      text = post.content;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("클립보드 복사에 실패했습니다.");
    }
  }, [draft, post.content]);

  return {
    isReviewPost,
    editing,
    draft,
    saving,
    deleting,
    copied,
    startEdit,
    cancelEdit,
    updateCaption,
    updateIntro,
    updateOutro,
    updateContent,
    handleSave,
    handleDelete,
    handleCopy,
  };
}
