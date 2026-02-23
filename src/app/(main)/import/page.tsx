"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";

const DELIMITER = "---";

function parsePosts(raw: string): string[] {
  return raw
    .split(DELIMITER)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export default function ImportPage() {
  const router = useRouter();
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
      router.push("/posts");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
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
          {saving ? "저장 중..." : `${parsed.length}개 일괄 저장`}
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
  );
}
