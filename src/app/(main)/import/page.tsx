"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { api } from "../../../../convex/_generated/api";
import type { ImportedNaverPost } from "@/lib/naverImport";

const DELIMITER = "---";

type NaverImportPayload = ImportedNaverPost | { error?: string; code?: string };

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
  const [sourceUrl, setSourceUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [importingUrl, setImportingUrl] = useState(false);

  const parsed = useMemo(() => parsePosts(raw), [raw]);
  const isBusy = saving || importingUrl;

  const handleImportFromUrl = async () => {
    const trimmedUrl = sourceUrl.trim();
    if (!trimmedUrl) {
      toast.error("URL을 입력해 주세요.");
      return;
    }

    setImportingUrl(true);
    try {
      const response = await fetch("/api/import/naver", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: trimmedUrl }),
      });

      const payload = (await response.json()) as NaverImportPayload;

      if (!response.ok || !("content" in payload) || !payload.content) {
        const errorMessage =
          "error" in payload && payload.error
            ? payload.error
            : "URL에서 본문을 가져오지 못했습니다.";
        throw new Error(errorMessage);
      }

      const importedContent = payload.content.trim();
      if (!importedContent) {
        throw new Error("본문 추출 결과가 비어 있습니다.");
      }

      setRaw((prev) => {
        const current = prev.trim();
        if (!current) return importedContent;
        return `${current}\n${DELIMITER}\n${importedContent}`;
      });

      setSourceUrl("");
      toast.success("URL에서 글을 불러왔습니다.");
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "URL 임포트 중 오류가 발생했습니다.",
      );
    } finally {
      setImportingUrl(false);
    }
  };

  const handleBulkSave = async () => {
    if (parsed.length === 0) return;

    setSaving(true);
    try {
      await bulkCreate({ contents: parsed });
      setRaw("");
      router.push("/posts");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="mb-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
        글 임포트
      </h2>
      <p className="mb-4 text-xs text-zinc-400">
        네이버 블로그 URL을 입력해 자동 임포트하거나, 기존 글을 직접 붙여넣으세요.
      </p>

      <div className="mb-4 flex gap-2">
        <input
          type="url"
          className="h-10 flex-1 rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm text-zinc-900 placeholder-zinc-400 outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500 dark:focus:border-zinc-500"
          placeholder="https://blog.naver.com/{blogId}/{logNo}"
          value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)}
          disabled={isBusy}
        />
        <button
          type="button"
          onClick={handleImportFromUrl}
          disabled={isBusy || sourceUrl.trim().length === 0}
          className="h-10 rounded-lg border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
        >
          {importingUrl ? "가져오는 중..." : "URL 가져오기"}
        </button>
      </div>

      <p className="mb-4 text-xs text-zinc-400">
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
        disabled={isBusy}
      />

      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs text-zinc-400">
          {parsed.length > 0
            ? `${parsed.length}개 글이 감지됨`
            : "글을 입력해 주세요"}
        </span>
        <button
          onClick={handleBulkSave}
          disabled={isBusy || parsed.length === 0}
          className="rounded-lg bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {saving ? "저장 중..." : `${parsed.length}개 일괄 저장`}
        </button>
      </div>

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
              <span className="mr-2 font-semibold text-zinc-400">#{i + 1}</span>
              {text.length > 100 ? `${text.slice(0, 100)}...` : text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
