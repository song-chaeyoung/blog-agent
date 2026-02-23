"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";

export default function PostDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const post = useQuery(api.posts.getPost, {
    postId: id as Id<"posts">,
  });
  const deletePost = useMutation(api.posts.deletePost);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirm("정말 이 글을 삭제하시겠습니까?")) return;

    setDeleting(true);
    try {
      await deletePost({ postId: id as Id<"posts"> });
      router.push("/posts");
    } finally {
      setDeleting(false);
    }
  };

  if (post === undefined) {
    return <p className="text-sm text-zinc-400">로딩 중...</p>;
  }

  if (post === null) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-zinc-400 mb-3">글을 찾을 수 없습니다.</p>
        <Link
          href="/posts"
          className="text-sm font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
        >
          글 목록으로 돌아가기
        </Link>
      </div>
    );
  }

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
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
          {post.content}
        </p>

        <div className="mt-6 flex items-center justify-between border-t border-zinc-100 pt-4 dark:border-zinc-800">
          <div className="flex items-center gap-3 text-xs text-zinc-400">
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
            {post.imageUrl && (
              <span className="text-blue-500">이미지 생성 글</span>
            )}
          </div>

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
  );
}
