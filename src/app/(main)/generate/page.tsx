"use client";

import { useReducer, useCallback } from "react";
import { useAction } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "../../../../convex/_generated/api";
import ImageUploader from "@/components/image-uploader";
import type { ResultData } from "@/types/post";
import { useResultEditor } from "@/hooks/useResultEditor";

// ─── State & Action 타입 ────────────────────────────────────────────────────

type PageState =
  | { step: "upload"; imageUrls: string[]; allReady: boolean }
  | { step: "generating"; imageCount: number }
  | { step: "result"; result: ResultData };

type Action =
  | { type: "SET_IMAGES"; imageUrls: string[]; allReady: boolean }
  | { type: "START_GENERATING" }
  | { type: "SET_RESULT"; result: ResultData }
  | { type: "RESET" };

const initialState: PageState = {
  step: "upload",
  imageUrls: [],
  allReady: false,
};

function reducer(state: PageState, action: Action): PageState {
  switch (action.type) {
    case "SET_IMAGES":
      if (state.step !== "upload") return state;
      return {
        ...state,
        imageUrls: action.imageUrls,
        allReady: action.allReady,
      };

    case "START_GENERATING":
      if (state.step !== "upload") return state;
      return { step: "generating", imageCount: state.imageUrls.length };

    case "SET_RESULT":
      return { step: "result", result: action.result };

    case "RESET":
      return initialState;

    default:
      return state;
  }
}

// ─── 메인 페이지 ─────────────────────────────────────────────────────────────

export default function GeneratePage() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const createBlogReview = useAction(api.generate.createBlogReview);

  const handleImagesChange = useCallback((urls: string[], ready: boolean) => {
    dispatch({ type: "SET_IMAGES", imageUrls: urls, allReady: ready });
  }, []);

  const handleGenerate = async () => {
    if (state.step !== "upload" || state.imageUrls.length === 0) return;
    dispatch({ type: "START_GENERATING" });
    try {
      const result = await createBlogReview({ imageUrls: state.imageUrls });
      dispatch({ type: "SET_RESULT", result });
    } catch {
      dispatch({ type: "RESET" });
      alert("글 생성에 실패했습니다. 다시 시도해 주세요.");
    }
  };

  // ── 업로드 단계
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
        <ImageUploader onImagesChange={handleImagesChange} maxImages={20} />
        <button
          onClick={handleGenerate}
          disabled={!state.allReady || state.imageUrls.length === 0}
          className="w-full rounded-lg bg-zinc-900 px-4 py-3 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {state.imageUrls.length > 0
            ? `${state.imageUrls.length}장의 이미지로 글 생성하기`
            : "이미지를 업로드해 주세요"}
        </button>
      </div>
    );
  }

  // ── 생성 중 단계
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

  // ── 결과 단계
  return (
    <ResultView
      result={state.result}
      onReset={() => dispatch({ type: "RESET" })}
    />
  );
}

// ─── 결과 뷰 컴포넌트 ──────────────────────────────────────────────────────────

function ResultView({
  result,
  onReset,
}: {
  result: ResultData;
  onReset: () => void;
}) {
  const router = useRouter();
  const {
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
  } = useResultEditor(result);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          생성 결과
        </h2>
        <button
          onClick={onReset}
          className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          새로 생성
        </button>
      </div>

      {/* 블로그 리뷰 미리보기 */}
      <div className="space-y-6 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        {/* 도입부 */}
        {display.intro &&
          (editMode ? (
            <textarea
              value={draft.intro}
              onChange={(e) => updateIntro(e.target.value)}
              className="w-full resize-y rounded-lg border border-zinc-200 bg-transparent p-3 text-sm leading-relaxed text-zinc-800 outline-none focus:border-zinc-400 dark:border-zinc-700 dark:text-zinc-200 dark:focus:border-zinc-500"
              rows={3}
            />
          ) : (
            <p className="whitespace-pre-wrap px-1 text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
              {display.intro}
            </p>
          ))}

        {/* 이미지 + 캡션 */}
        {display.blocks.map((block, i) => (
          <div key={block.url} className="space-y-3">
            <img
              src={block.url}
              alt={`이미지 ${i + 1}`}
              className="w-full rounded-lg object-cover"
              style={{ maxHeight: 400 }}
            />
            {editMode ? (
              <textarea
                value={draft.blocks[i]?.caption ?? ""}
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
        {display.outro &&
          (editMode ? (
            <textarea
              value={draft.outro}
              onChange={(e) => updateOutro(e.target.value)}
              className="w-full resize-y rounded-lg border border-zinc-200 bg-transparent p-3 text-sm leading-relaxed text-zinc-800 outline-none focus:border-zinc-400 dark:border-zinc-700 dark:text-zinc-200 dark:focus:border-zinc-500"
              rows={3}
            />
          ) : (
            <p className="whitespace-pre-wrap px-1 text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
              {display.outro}
            </p>
          ))}
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
              onClick={cancelEdit}
              className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            >
              취소
            </button>
          </>
        ) : (
          <>
            <button
              onClick={startEdit}
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
              onClick={() => router.push(`/posts/${result.postId}`)}
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
