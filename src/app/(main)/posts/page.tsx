"use client";

import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";

export default function PostsPage() {
  const posts = useQuery(api.posts.listMyPosts);
  const retryEmbeddings = useMutation(api.posts.retryMissingEmbeddings);

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
          <Link key={post._id} href={`/posts/${post._id}`} className="block">
            <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700">
              <p className="whitespace-pre-wrap text-sm text-zinc-800 dark:text-zinc-200">
                {post.content.length > 200
                  ? post.content.slice(0, 200) + "..."
                  : post.content}
              </p>
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
              </div>
            </div>
          </Link>
        ))
      )}
    </div>
  );
}
