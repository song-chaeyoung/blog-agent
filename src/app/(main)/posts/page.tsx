"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

export default function PostsPage() {
  const posts = useQuery(api.posts.listMyPosts);
  const retryEmbeddings = useMutation(api.posts.retryMissingEmbeddings);
  const deletePost = useMutation(api.posts.deletePost);
  const [deletingId, setDeletingId] = useState<Id<"posts"> | null>(null);

  const handleDelete = async (e: React.MouseEvent, postId: Id<"posts">) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("이 글을 삭제하시겠습니까? 학습된 데이터도 함께 삭제됩니다."))
      return;

    setDeletingId(postId);
    try {
      await deletePost({ postId });
    } finally {
      setDeletingId(null);
    }
  };

  const embeddingDone = posts?.filter((p) => p.embedding).length ?? 0;
  const totalPosts = posts?.length ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          학습된 글 목록
        </h2>
        {totalPosts > 0 && (
          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-400">
              embedding {embeddingDone}/{totalPosts}
            </span>
            {embeddingDone < totalPosts && (
              <button
                onClick={() => retryEmbeddings()}
                className="text-xs font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
              >
                재시도
              </button>
            )}
          </div>
        )}
      </div>

      {posts === undefined ? (
        <p className="text-sm text-zinc-400">로딩 중...</p>
      ) : posts.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-sm text-zinc-400 mb-3">
            아직 임포트된 글이 없습니다.
          </p>
          <Link
            href="/import"
            className="text-sm font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
          >
            글 임포트하러 가기
          </Link>
        </div>
      ) : (
        posts.map((post) => (
          <div key={post._id} className="relative group">
            <Link href={`/posts/${post._id}`} className="block">
              <div className="rounded-xl border border-zinc-200 bg-white p-5 pr-10 shadow-sm transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700">
                <p className="whitespace-pre-wrap text-sm text-zinc-800 dark:text-zinc-200">
                  {post.content.length > 200
                    ? post.content.slice(0, 200) + "..."
                    : post.content}
                </p>
                {/* 리뷰 글 썸네일 미리보기 */}
                {post.imageBlocks && post.imageBlocks.length > 0 && (
                  <div className="mt-3 flex gap-1.5 overflow-hidden">
                    {post.imageBlocks.slice(0, 4).map((block, i) => (
                      <img
                        key={i}
                        src={block.url}
                        alt=""
                        className="h-12 w-12 rounded object-cover"
                      />
                    ))}
                    {post.imageBlocks.length > 4 && (
                      <div className="flex h-12 w-12 items-center justify-center rounded bg-zinc-100 text-xs text-zinc-500 dark:bg-zinc-800">
                        +{post.imageBlocks.length - 4}
                      </div>
                    )}
                  </div>
                )}
                <div className="mt-3 flex items-center gap-3 text-xs text-zinc-400">
                  <span>
                    {new Date(post._creationTime).toLocaleDateString("ko-KR")}
                  </span>
                  <span
                    className={
                      post.embedding ? "text-green-500" : "text-yellow-500"
                    }
                  >
                    {post.embedding ? "embedding 완료" : "embedding 생성 중..."}
                  </span>
                  {post.imageBlocks && post.imageBlocks.length > 0 ? (
                    <span className="text-blue-500">
                      리뷰 글 ({post.imageBlocks.length}장)
                    </span>
                  ) : (
                    post.imageUrl && (
                      <span className="text-blue-500">이미지 생성 글</span>
                    )
                  )}
                </div>
              </div>
            </Link>
            <button
              onClick={(e) => handleDelete(e, post._id)}
              disabled={deletingId === post._id}
              className="absolute top-3 right-3 p-1 rounded-md text-zinc-300 opacity-0 group-hover:opacity-100 hover:text-red-500 hover:bg-red-50 dark:text-zinc-600 dark:hover:text-red-400 dark:hover:bg-red-950 transition-all disabled:opacity-40"
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
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        ))
      )}
    </div>
  );
}
