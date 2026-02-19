"use client";

import { useState, useRef, useCallback } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";

type UploadState =
  | { status: "idle" }
  | { status: "uploading" }
  | { status: "done"; url: string }
  | { status: "error"; message: string };

interface ImageUploaderProps {
  onUploadComplete: (url: string) => void;
}

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

export default function ImageUploader({ onUploadComplete }: ImageUploaderProps) {
  const generateUploadUrl = useMutation(api.images.generateUploadUrl);
  const getImageUrl = useMutation(api.images.getImageUrl);
  const [state, setState] = useState<UploadState>({ status: "idle" });
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = useCallback(
    async (file: File) => {
      if (!ACCEPTED_TYPES.includes(file.type)) {
        setState({ status: "error", message: "JPG, PNG, GIF, WebP만 지원됩니다." });
        return;
      }
      if (file.size > MAX_SIZE) {
        setState({ status: "error", message: "5MB 이하의 이미지만 업로드할 수 있습니다." });
        return;
      }

      setState({ status: "uploading" });

      try {
        // 1. 업로드 URL 생성
        const uploadUrl = await generateUploadUrl();

        // 2. Convex Storage에 파일 업로드
        const res = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });

        if (!res.ok) throw new Error("업로드 실패");

        const { storageId } = await res.json();

        // 3. storageId → 공개 URL 변환
        const imageUrl = await getImageUrl({ storageId });

        setState({ status: "done", url: imageUrl });
        onUploadComplete(imageUrl);
      } catch {
        setState({ status: "error", message: "업로드 중 오류가 발생했습니다." });
      }
    },
    [generateUploadUrl, getImageUrl, onUploadComplete]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) upload(file);
    },
    [upload]
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) upload(file);
    },
    [upload]
  );

  const reset = () => {
    setState({ status: "idle" });
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="w-full">
      {/* 드롭존 */}
      {state.status !== "done" && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors ${
            dragOver
              ? "border-blue-400 bg-blue-50 dark:border-blue-500 dark:bg-blue-950"
              : "border-zinc-300 bg-zinc-50 hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:border-zinc-500"
          }`}
        >
          {state.status === "uploading" ? (
            <div className="flex flex-col items-center gap-2">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-600 dark:border-t-zinc-100" />
              <span className="text-sm text-zinc-500 dark:text-zinc-400">
                업로드 중...
              </span>
            </div>
          ) : (
            <>
              <svg
                className="mb-2 h-8 w-8 text-zinc-400 dark:text-zinc-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                />
              </svg>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                이미지를 드래그하거나 클릭하여 업로드
              </p>
              <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                JPG, PNG, GIF, WebP (최대 5MB)
              </p>
            </>
          )}
        </div>
      )}

      {/* 업로드 완료 미리보기 */}
      {state.status === "done" && (
        <div className="relative rounded-lg border border-zinc-200 bg-white p-2 dark:border-zinc-700 dark:bg-zinc-900">
          <img
            src={state.url}
            alt="업로드된 이미지"
            className="w-full rounded-md object-cover"
            style={{ maxHeight: 240 }}
          />
          <button
            onClick={reset}
            className="absolute top-3 right-3 rounded-full bg-black/50 p-1.5 text-white transition-colors hover:bg-black/70"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* 에러 메시지 */}
      {state.status === "error" && (
        <div className="mt-2 flex items-center justify-between rounded-lg bg-red-50 px-4 py-2.5 dark:bg-red-950">
          <span className="text-sm text-red-600 dark:text-red-400">
            {state.message}
          </span>
          <button
            onClick={reset}
            className="text-xs font-medium text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
          >
            다시 시도
          </button>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(",")}
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
}
