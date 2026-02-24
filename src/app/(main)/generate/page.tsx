"use client";

import { useState, useCallback } from "react";
import { useAction, useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import ImageUploader from "../../../components/image-uploader";

type ImageBlock = { url: string; caption: string };

type State =
  | { step: "upload" }
  | { step: "generating"; imageCount: number }
  | {
      step: "result";
      content: string;
      imageBlocks: ImageBlock[];
      intro: string;
      outro: string;
      postId: Id<"posts">;
    };

export default function GeneratePage() {
  const router = useRouter();
  const createBlogReview = useAction(api.generate.createBlogReview);
  const updatePost = useMutation(api.posts.updatePost);

  const [state, setState] = useState<State>({ step: "upload" });
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [allReady, setAllReady] = useState(false);

  // 결과 편집 상태
  const [editMode, setEditMode] = useState(false);
  const [editedBlocks, setEditedBlocks] = useState<ImageBlock[]>([]);
  const [editedIntro, setEditedIntro] = useState("");
  const [editedOutro, setEditedOutro] = useState("");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleImagesChange = useCallback(
    (urls: string[], ready: boolean) => {
      setImageUrls(urls);
      setAllReady(ready);
    },
    []
  );

  const handleGenerate = async () => {
    if (imageUrls.length === 0) return;
    setState({ step: "generating", imageCount: imageUrls.length });
    try {
      const result = await createBlogReview({ imageUrls });
      setState({
        step: "result",
        content: result.content,
        imageBlocks: result.imageBlocks,
        intro: result.intro,
        outro: result.outro,
        postId: result.postId,
      });
      setEditedBlocks(result.imageBlocks);
      setEditedIntro(result.intro);
      setEditedOutro(result.outro);
    } catch {
      setState({ step: "upload" });
      alert("글 생성에 실패했습니다. 다시 시도해 주세요.");
    }
  };

  const handleSave = async () => {
    if (state.step !== "result") return;
    setSaving(true);
    try {
      const parts: string[] = [];
      if (editedIntro) parts.push(editedIntro);
      editedBlocks.forEach((b) => { if (b.caption) parts.push(b.caption); });
      if (editedOutro) parts.push(editedOutro);
      await updatePost({
        postId: state.postId,
        content: parts.join("\n\n"),
        imageBlocks: editedBlocks,
        intro: editedIntro,
        outro: editedOutro,
      });
      router.push(`/posts/${state.postId}`);
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = async () => {
    if (state.step !== "result") return;
    const text = editMode
      ? editedBlocks.map((b) => b.caption).join("\n\n")
      : state.content;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReset = () => {
    setState({ step: "upload" });
    setImageUrls([]);
    setAllReady(false);
    setEditMode(false);
    setEditedBlocks([]);
    setEditedIntro("");
    setEditedOutro("");
    setCopied(false);
  };

  const updateCaption = (index: number, caption: string) => {
    setEditedBlocks((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], caption };
      return updated;
    });
  };

  const hasChanges =
    state.step === "result" &&
    editedBlocks.some((b, i) => b.caption !== state.imageBlocks[i]?.caption);

  // 업로드 단계
  if (state.step === "upload") {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          이미지로 리뷰 글 생성
        </h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          이미지를 업로드하면 AI가 내 문체로 블로그 리뷰 글을 작성합니다. (최대
          20장)
        </p>
        <ImageUploader
          onImagesChange={handleImagesChange}
          maxImages={20}
        />
        <button
          onClick={handleGenerate}
          disabled={!allReady || imageUrls.length === 0}
          className="w-full rounded-lg bg-zinc-900 px-4 py-3 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {imageUrls.length > 0
            ? `${imageUrls.length}장의 이미지로 글 생성하기`
            : "이미지를 업로드해 주세요"}
        </button>
      </div>
    );
  }

  // 생성 중 단계
  if (state.step === "generating") {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-600 dark:border-t-zinc-100" />
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          AI가 리뷰 글을 생성하고 있습니다...
        </p>
        <p className="text-xs text-zinc-400 dark:text-zinc-500">
          이미지 {state.imageCount}장 분석 → 유사 글 검색 → 리뷰 글 작성 중
        </p>
      </div>
    );
  }

  // 결과 화면
  const blocks = editMode ? editedBlocks : state.imageBlocks;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          생성 결과
        </h2>
        <button
          onClick={handleReset}
          className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          새로 생성
        </button>
      </div>

      {/* 블로그 리뷰 미리보기 */}
      <div className="space-y-6 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        {/* 도입부 */}
        {(editMode ? editedIntro : state.intro) && (
          editMode ? (
            <textarea
              value={editedIntro}
              onChange={(e) => setEditedIntro(e.target.value)}
              className="w-full resize-y rounded-lg border border-zinc-200 bg-transparent p-3 text-sm leading-relaxed text-zinc-800 outline-none focus:border-zinc-400 dark:border-zinc-700 dark:text-zinc-200 dark:focus:border-zinc-500"
              rows={3}
            />
          ) : (
            <p className="whitespace-pre-wrap px-1 text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
              {state.intro}
            </p>
          )
        )}

        {/* 이미지 + 캡션 */}
        {blocks.map((block, i) => (
          <div key={block.url} className="space-y-3">
            <img
              src={block.url}
              alt={`이미지 ${i + 1}`}
              className="w-full rounded-lg object-cover"
              style={{ maxHeight: 400 }}
            />
            {editMode ? (
              <textarea
                value={block.caption}
                onChange={(e) => updateCaption(i, e.target.value)}
                className="w-full resize-y rounded-lg border border-zinc-200 bg-transparent p-3 text-sm leading-relaxed text-zinc-800 outline-none focus:border-zinc-400 dark:border-zinc-700 dark:text-zinc-200 dark:focus:border-zinc-500"
                rows={3}
              />
            ) : (
              <p className="whitespace-pre-wrap px-1 text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
                {block.caption}
              </p>
            )}
          </div>
        ))}

        {/* 마무리 */}
        {(editMode ? editedOutro : state.outro) && (
          editMode ? (
            <textarea
              value={editedOutro}
              onChange={(e) => setEditedOutro(e.target.value)}
              className="w-full resize-y rounded-lg border border-zinc-200 bg-transparent p-3 text-sm leading-relaxed text-zinc-800 outline-none focus:border-zinc-400 dark:border-zinc-700 dark:text-zinc-200 dark:focus:border-zinc-500"
              rows={3}
            />
          ) : (
            <p className="whitespace-pre-wrap px-1 text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
              {state.outro}
            </p>
          )
        )}
      </div>

      {/* 액션 버튼 */}
      <div className="flex items-center gap-3">
        {editMode ? (
          <>
            <button
              onClick={handleSave}
              disabled={saving || !hasChanges}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              {saving ? "저장 중..." : "수정 저장"}
            </button>
            <button
              onClick={() => {
                setEditedBlocks(state.imageBlocks);
                setEditedIntro(state.intro);
                setEditedOutro(state.outro);
                setEditMode(false);
              }}
              className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            >
              취소
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => setEditMode(true)}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              수정하기
            </button>
            <button
              onClick={handleCopy}
              className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            >
              {copied ? "복사 완료!" : "복사하기"}
            </button>
            <button
              onClick={() => router.push(`/posts/${state.postId}`)}
              className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              글 보기 →
            </button>
          </>
        )}
      </div>
    </div>
  );
}
