"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { usePostEditor } from "../../../../hooks/usePostEditor";

export default function PostDetailPage() {
  const { id } = useParams<{ id: string }>();
  const post = useQuery(api.posts.getPost, {
    postId: id as Id<"posts">,
  });

  if (post === undefined) {
    return <p className="text-sm text-zinc-400">로딩 중...</p>;
  }

  if (post === null) {
    return (
      <div className="py-12 text-center">
        <p className="mb-3 text-sm text-zinc-400">글을 찾을 수 없습니다.</p>
        <Link
          href="/posts"
          className="text-sm font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
        >
          글 목록으로 돌아가기
        </Link>
      </div>
    );
  }

  return <PostDetail post={post} />;
}

// ─── 실제 포스트 뷰 (post가 확정된 이후) ──────────────────────────────────────

type ConvexPost = NonNullable<
  ReturnType<typeof useQuery<typeof api.posts.getPost>>
>;

function PostDetail({ post }: { post: ConvexPost }) {
  const {
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
  } = usePostEditor(post);

  return (
    <div className="space-y-6">
      {/* 뒤로가기 */}
      <Link
        href="/posts"
        className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 19l-7-7 7-7"
          />
        </svg>
        글 목록
      </Link>

      {/* 글 내용 */}
      <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        {isReviewPost ? (
          // ── 리뷰 글: intro + 이미지/캡션 + outro
          <div className="space-y-6">
            {/* 도입부 */}
            {(editing ? draft?.kind === "review" && draft.intro : post.intro) &&
              (editing && draft?.kind === "review" ? (
                <textarea
                  value={draft.intro}
                  onChange={(e) => updateIntro(e.target.value)}
                  className="w-full resize-y rounded-lg border border-zinc-200 bg-transparent p-3 text-sm leading-relaxed text-zinc-800 outline-none focus:border-zinc-400 dark:border-zinc-700 dark:text-zinc-200 dark:focus:border-zinc-500"
                  rows={3}
                />
              ) : (
                <p className="whitespace-pre-wrap px-1 text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
                  {post.intro}
                </p>
              ))}

            {/* 이미지 + 캡션 */}
            {(editing && draft?.kind === "review"
              ? draft.blocks
              : post.imageBlocks!
            ).map((block, i) => (
              <div key={block.url} className="space-y-3">
                <img
                  src={block.url}
                  alt={`이미지 ${i + 1}`}
                  className="w-full rounded-lg object-cover"
                  style={{ maxHeight: 480 }}
                />
                {editing && draft?.kind === "review" ? (
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
            {(editing ? draft?.kind === "review" && draft.outro : post.outro) &&
              (editing && draft?.kind === "review" ? (
                <textarea
                  value={draft.outro}
                  onChange={(e) => updateOutro(e.target.value)}
                  className="w-full resize-y rounded-lg border border-zinc-200 bg-transparent p-3 text-sm leading-relaxed text-zinc-800 outline-none focus:border-zinc-400 dark:border-zinc-700 dark:text-zinc-200 dark:focus:border-zinc-500"
                  rows={3}
                />
              ) : (
                <p className="whitespace-pre-wrap px-1 text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
                  {post.outro}
                </p>
              ))}
          </div>
        ) : editing && draft?.kind === "plain" ? (
          // ── 일반 글 편집
          <textarea
            value={draft.content}
            onChange={(e) => updateContent(e.target.value)}
            className="min-h-[240px] w-full resize-y rounded-lg bg-transparent text-sm leading-relaxed text-zinc-800 outline-none dark:text-zinc-200"
          />
        ) : (
          // ── 일반 글 보기
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
            {post.content}
          </p>
        )}

        {/* 하단 메타 + 액션 */}
        <div className="mt-6 flex items-center justify-between border-t border-zinc-100 pt-4 dark:border-zinc-800">
          <div className="flex items-center gap-3 text-xs text-zinc-400">
            <span>
              {new Date(post._creationTime).toLocaleDateString("ko-KR")}
            </span>
            <span
              className={post.embedding ? "text-green-500" : "text-yellow-500"}
            >
              {post.embedding ? "embedding 완료" : "embedding 생성 중..."}
            </span>
            {isReviewPost ? (
              <span className="text-blue-500">
                리뷰 글 ({post.imageBlocks!.length}장)
              </span>
            ) : (
              post.imageUrl && (
                <span className="text-blue-500">이미지 생성 글</span>
              )
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* 복사 */}
            <button
              onClick={handleCopy}
              className="text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              {copied ? "복사 완료!" : "복사"}
            </button>

            {/* 수정 / 저장 / 취소 */}
            {editing ? (
              <>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="text-xs font-medium text-blue-600 hover:text-blue-800 disabled:opacity-40 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  {saving ? "저장 중..." : "저장"}
                </button>
                <button
                  onClick={cancelEdit}
                  className="text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                >
                  취소
                </button>
              </>
            ) : (
              <button
                onClick={startEdit}
                className="text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                수정
              </button>
            )}

            {/* 삭제 */}
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="text-xs font-medium text-red-500 hover:text-red-700 disabled:opacity-40 dark:text-red-400 dark:hover:text-red-300"
            >
              {deleting ? "삭제 중..." : "삭제"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
