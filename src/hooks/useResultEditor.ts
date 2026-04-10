import { useEffect, useState, useCallback } from "react";
import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api } from "../../convex/_generated/api";
import type { ImageBlock, ResultData } from "@/types/post";

export type { ImageBlock, ResultData };

type ReviewDraft = {
  kind: "review";
  blocks: ImageBlock[];
  intro: string;
  outro: string;
};

type SingleDraft = {
  kind: "single";
  content: string;
};

type EditDraft = ReviewDraft | SingleDraft;

function makeDraftFromResult(result: ResultData): EditDraft {
  return result.mode === "review"
    ? {
        kind: "review",
        blocks: result.imageBlocks,
        intro: result.intro,
        outro: result.outro,
      }
    : { kind: "single", content: result.content };
}

export function useResultEditor(result: ResultData) {
  const router = useRouter();
  const updatePost = useMutation(api.posts.updatePost);

  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState<EditDraft>(makeDraftFromResult(result));
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!editMode) {
      setDraft(makeDraftFromResult(result));
    }
  }, [editMode, result]);

  const hasChanges =
    result.mode === "review" && draft.kind === "review"
      ? draft.intro !== result.intro ||
        draft.outro !== result.outro ||
        draft.blocks.some((b, i) => b.caption !== result.imageBlocks[i]?.caption)
      : draft.kind === "single"
      ? draft.content !== result.content
      : false;

  const startEdit = useCallback(() => {
    setDraft(makeDraftFromResult(result));
    setEditMode(true);
  }, [result]);

  const cancelEdit = useCallback(() => {
    setDraft(makeDraftFromResult(result));
    setEditMode(false);
  }, [result]);

  const updateCaption = useCallback((index: number, caption: string) => {
    setDraft((prev) => {
      if (prev.kind !== "review") return prev;
      const updated = [...prev.blocks];
      updated[index] = { ...updated[index], caption };
      return { ...prev, blocks: updated };
    });
  }, []);

  const updateIntro = useCallback((intro: string) => {
    setDraft((prev) => (prev.kind === "review" ? { ...prev, intro } : prev));
  }, []);

  const updateOutro = useCallback((outro: string) => {
    setDraft((prev) => (prev.kind === "review" ? { ...prev, outro } : prev));
  }, []);

  const updateContent = useCallback((content: string) => {
    setDraft((prev) => (prev.kind === "single" ? { ...prev, content } : prev));
  }, []);

  const handleSave = useCallback(async () => {
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
          postId: result.postId,
          content: parts.join("\n\n"),
          imageBlocks: draft.blocks,
          intro: draft.intro,
          outro: draft.outro,
        });
      } else {
        await updatePost({
          postId: result.postId,
          content: draft.content,
        });
      }
      router.push(`/posts/${result.postId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  }, [draft, result.postId, updatePost, router]);

  const handleCopy = useCallback(async () => {
    const text =
      draft.kind === "review"
        ? [draft.intro, ...draft.blocks.map((b) => b.caption), draft.outro]
            .filter((x) => x.trim().length > 0)
            .join("\n\n")
        : draft.content;

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("클립보드 복사에 실패했습니다.");
    }
  }, [draft]);

  return {
    editMode,
    draft,
    hasChanges,
    saving,
    copied,
    startEdit,
    cancelEdit,
    updateCaption,
    updateIntro,
    updateOutro,
    updateContent,
    handleSave,
    handleCopy,
  };
}
