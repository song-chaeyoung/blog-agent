import { useState, useCallback } from "react";
import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

export type ImageBlock = { url: string; caption: string };

export type ResultData = {
  content: string;
  imageBlocks: ImageBlock[];
  intro: string;
  outro: string;
  postId: Id<"posts">;
};

type EditDraft = {
  blocks: ImageBlock[];
  intro: string;
  outro: string;
};

/**
 * 생성 결과 편집 관련 상태와 핸들러를 관리하는 훅
 */
export function useResultEditor(result: ResultData) {
  const router = useRouter();
  const updatePost = useMutation(api.posts.updatePost);

  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState<EditDraft>({
    blocks: result.imageBlocks,
    intro: result.intro,
    outro: result.outro,
  });
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const hasChanges =
    draft.intro !== result.intro ||
    draft.outro !== result.outro ||
    draft.blocks.some((b, i) => b.caption !== result.imageBlocks[i]?.caption);

  const startEdit = useCallback(() => {
    setDraft({
      blocks: result.imageBlocks,
      intro: result.intro,
      outro: result.outro,
    });
    setEditMode(true);
  }, [result]);

  const cancelEdit = useCallback(() => {
    setDraft({
      blocks: result.imageBlocks,
      intro: result.intro,
      outro: result.outro,
    });
    setEditMode(false);
  }, [result]);

  const updateCaption = useCallback((index: number, caption: string) => {
    setDraft((prev) => {
      const updated = [...prev.blocks];
      updated[index] = { ...updated[index], caption };
      return { ...prev, blocks: updated };
    });
  }, []);

  const updateIntro = useCallback((intro: string) => {
    setDraft((prev) => ({ ...prev, intro }));
  }, []);

  const updateOutro = useCallback((outro: string) => {
    setDraft((prev) => ({ ...prev, outro }));
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
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
      router.push(`/posts/${result.postId}`);
    } finally {
      setSaving(false);
    }
  }, [draft, result.postId, updatePost, router]);

  const handleCopy = useCallback(async () => {
    const text = editMode
      ? draft.blocks.map((b) => b.caption).join("\n\n")
      : result.content;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [editMode, draft.blocks, result.content]);

  // 표시할 실제 데이터 (편집 모드면 draft, 아니면 원본)
  const display = editMode
    ? draft
    : { blocks: result.imageBlocks, intro: result.intro, outro: result.outro };

  return {
    editMode,
    display,
    draft,
    hasChanges,
    saving,
    copied,
    startEdit,
    cancelEdit,
    updateCaption,
    updateIntro,
    updateOutro,
    handleSave,
    handleCopy,
  };
}
