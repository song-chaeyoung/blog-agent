"use client";

import { useState, useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { SignInButton, UserButton, useUser } from "@clerk/nextjs";

const DELIMITER = "---";

function parsePosts(raw: string): string[] {
  return raw
    .split(DELIMITER)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export default function Home() {
  const { isSignedIn, isLoaded } = useUser();
  const posts = useQuery(api.posts.listMyPosts);
  const bulkCreate = useMutation(api.posts.bulkCreatePosts);

  const [raw, setRaw] = useState("");
  const [saving, setSaving] = useState(false);

  const parsed = useMemo(() => parsePosts(raw), [raw]);

  const handleBulkSave = async () => {
    if (parsed.length === 0) return;

    setSaving(true);
    try {
      await bulkCreate({ contents: parsed });
      setRaw("");
    } finally {
      setSaving(false);
    }
  };

  if (!isLoaded) return null;

  const embeddingDone = posts?.filter((p) => p.embedding).length ?? 0;
  const totalPosts = posts?.length ?? 0;

  return (
    <div className="flex min-h-screen items-start justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="w-full max-w-2xl px-6 py-12">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-10">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            Blog Agent
          </h1>
          {isSignedIn ? (
            <UserButton />
          ) : (
            <SignInButton mode="modal">
              <button className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300">
                로그인
              </button>
            </SignInButton>
          )}
        </div>

        {isSignedIn && (
          <>
            {/* 벌크 임포트 */}
            <div className="mb-10 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-1">
                글 임포트
              </h2>
              <p className="text-xs text-zinc-400 mb-4">
                기존 블로그 글을 붙여넣으세요. 글 사이에{" "}
                <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono dark:bg-zinc-800">
                  ---
                </code>{" "}
                구분자를 넣으면 여러 글로 분리됩니다.
              </p>
              <textarea
                className="w-full resize-none rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-900 placeholder-zinc-400 outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500 dark:focus:border-zinc-500"
                rows={10}
                placeholder={`첫 번째 글 내용...\n---\n두 번째 글 내용...\n---\n세 번째 글 내용...`}
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                disabled={saving}
              />
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-zinc-400">
                  {parsed.length > 0
                    ? `${parsed.length}개 글이 감지됨`
                    : "글을 입력해 주세요"}
                </span>
                <button
                  onClick={handleBulkSave}
                  disabled={saving || parsed.length === 0}
                  className="rounded-lg bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
                >
                  {saving
                    ? "저장 중..."
                    : `${parsed.length}개 일괄 저장`}
                </button>
              </div>

              {/* 파싱 미리보기 */}
              {parsed.length > 1 && (
                <div className="mt-4 space-y-2">
                  <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                    미리보기
                  </p>
                  {parsed.map((text, i) => (
                    <div
                      key={i}
                      className="rounded-lg border border-zinc-100 bg-zinc-50 p-3 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                    >
                      <span className="mr-2 font-semibold text-zinc-400">
                        #{i + 1}
                      </span>
                      {text.length > 100 ? text.slice(0, 100) + "..." : text}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 글 목록 */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                  학습된 글 목록
                </h2>
                {totalPosts > 0 && (
                  <span className="text-xs text-zinc-400">
                    embedding {embeddingDone}/{totalPosts}
                  </span>
                )}
              </div>
              {posts === undefined ? (
                <p className="text-sm text-zinc-400">로딩 중...</p>
              ) : posts.length === 0 ? (
                <p className="text-sm text-zinc-400">
                  아직 임포트된 글이 없습니다. 위에서 글을 붙여넣어 주세요.
                </p>
              ) : (
                posts.map((post) => (
                  <div
                    key={post._id}
                    className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
                  >
                    <p className="whitespace-pre-wrap text-sm text-zinc-800 dark:text-zinc-200">
                      {post.content.length > 200
                        ? post.content.slice(0, 200) + "..."
                        : post.content}
                    </p>
                    <div className="mt-3 flex items-center gap-3 text-xs text-zinc-400">
                      <span>
                        {new Date(post._creationTime).toLocaleDateString(
                          "ko-KR"
                        )}
                      </span>
                      <span
                        className={
                          post.embedding
                            ? "text-green-500"
                            : "text-yellow-500"
                        }
                      >
                        {post.embedding
                          ? "embedding 완료"
                          : "embedding 생성 중..."}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {!isSignedIn && (
          <div className="text-center py-20">
            <p className="text-zinc-500 dark:text-zinc-400">
              로그인하면 글을 임포트할 수 있습니다.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
