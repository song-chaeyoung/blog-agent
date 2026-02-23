"use client";

import { useState } from "react";
import { useAction, useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import ImageUploader from "../../../components/image-uploader";

type State =
  | { step: "upload" }
  | { step: "generating" }
  | { step: "result"; content: string; postId: Id<"posts"> };

export default function GeneratePage() {
  const router = useRouter();
  const createBlog = useAction(api.generate.createBlogFromImage);
  const updatePost = useMutation(api.posts.updatePost);

  const [state, setState] = useState<State>({ step: "upload" });
  const [editedContent, setEditedContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async (imageUrl: string) => {
    setState({ step: "generating" });
    try {
      const result = await createBlog({ imageUrl });
      setState({ step: "result", content: result.content, postId: result.postId });
      setEditedContent(result.content);
    } catch {
      setState({ step: "upload" });
      alert("글 생성에 실패했습니다. 다시 시도해 주세요.");
    }
  };

  const handleSave = async () => {
    if (state.step !== "result") return;
    setSaving(true);
    try {
      await updatePost({ postId: state.postId, content: editedContent });
      router.push(`/posts/${state.postId}`);
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(editedContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReset = () => {
    setState({ step: "upload" });
    setEditedContent("");
    setCopied(false);
  };

  // 업로드 단계
  if (state.step === "upload") {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          이미지로 글 생성
        </h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          이미지를 업로드하면 AI가 내 문체로 블로그 글을 작성합니다.
        </p>
        <ImageUploader onUploadComplete={handleGenerate} />
      </div>
    );
  }

  // 생성 중 단계
  if (state.step === "generating") {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-600 dark:border-t-zinc-100" />
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          AI가 글을 생성하고 있습니다...
        </p>
        <p className="text-xs text-zinc-400 dark:text-zinc-500">
          이미지 분석 → 유사 글 검색 → 글 작성 중
        </p>
      </div>
    );
  }

  // 결과 화면
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

      {/* 에디터 */}
      <div className="rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <textarea
          value={editedContent}
          onChange={(e) => setEditedContent(e.target.value)}
          className="w-full min-h-[320px] resize-y rounded-xl bg-transparent p-6 text-sm leading-relaxed text-zinc-800 outline-none dark:text-zinc-200"
        />
      </div>

      {/* 액션 버튼 */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving || editedContent === state.content}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {saving ? "저장 중..." : "수정 저장"}
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
      </div>
    </div>
  );
}
