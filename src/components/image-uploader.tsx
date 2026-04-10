"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { MAX_FILE_SIZE, ACCEPTED_TYPES, MAX_IMAGES } from "../constants";

export type UploadedImage = {
  url: string;
  storageId: Id<"_storage">;
};

type ImageItem =
  | { clientId: string; status: "uploading"; localPreview: string }
  | {
      clientId: string;
      status: "done";
      localPreview: string;
      url: string;
      storageId: Id<"_storage">;
    }
  | { clientId: string; status: "error"; localPreview: string; message: string };

interface ImageUploaderProps {
  onImagesChange: (images: UploadedImage[], allReady: boolean) => void;
  maxImages?: number;
}

export default function ImageUploader({
  onImagesChange,
  maxImages = MAX_IMAGES,
}: ImageUploaderProps) {
  const generateUploadUrl = useMutation(api.images.generateUploadUrl);
  const getImageUrl = useMutation(api.images.getImageUrl);
  const deleteTempImage = useMutation(api.images.deleteTempImage);
  const [images, setImages] = useState<ImageItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const nextClientIdRef = useRef(0);
  const removedDuringUploadRef = useRef(new Set<string>());

  const createClientId = () => {
    nextClientIdRef.current += 1;
    return `upload-${nextClientIdRef.current}`;
  };

  // images 변경 시 부모에게 알림 (useEffect로 렌더 사이클 분리)
  useEffect(() => {
    const doneItems = images.filter(
      (img): img is Extract<ImageItem, { status: "done" }> =>
        img.status === "done"
    );
    const allReady =
      images.length > 0 && images.every((img) => img.status === "done");
    onImagesChange(
      doneItems.map((img) => ({ url: img.url, storageId: img.storageId })),
      allReady
    );
  }, [images, onImagesChange]);

  const uploadFile = useCallback(
    async (file: File, clientId: string) => {
      try {
        const uploadUrl = await generateUploadUrl();
        const res = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!res.ok) throw new Error("업로드 실패");

        const { storageId } = await res.json();
        const uploaded = await getImageUrl({ storageId });

        if (removedDuringUploadRef.current.has(clientId)) {
          removedDuringUploadRef.current.delete(clientId);
          void deleteTempImage({ storageId: uploaded.storageId }).catch(() => {
            // 삭제 중 오류가 나도 TTL cleanup으로 최종 정리됩니다.
          });
          return;
        }

        setImages((prev) => {
          return prev.map((item) => {
            if (item.clientId !== clientId || item.status !== "uploading") {
              return item;
            }
            return {
              ...item,
              status: "done",
              url: uploaded.url,
              storageId: uploaded.storageId,
            };
          });
        });
      } catch {
        if (removedDuringUploadRef.current.has(clientId)) {
          removedDuringUploadRef.current.delete(clientId);
          return;
        }
        setImages((prev) => {
          return prev.map((item) => {
            if (item.clientId !== clientId || item.status !== "uploading") {
              return item;
            }
            return {
              ...item,
              status: "error",
              message: "업로드 실패",
            };
          });
        });
      }
    },
    [deleteTempImage, generateUploadUrl, getImageUrl]
  );

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const fileArray = Array.from(files);
      const remaining = maxImages - images.length;
      const toAdd = fileArray.slice(0, remaining);

      const validFiles: { file: File; preview: string }[] = [];
      for (const file of toAdd) {
        if (!ACCEPTED_TYPES.includes(file.type)) continue;
        if (file.size > MAX_FILE_SIZE) continue;
        validFiles.push({
          file,
          preview: URL.createObjectURL(file),
        });
      }

      if (validFiles.length === 0) return;

      const newItems: ImageItem[] = validFiles.map((f) => ({
        clientId: createClientId(),
        status: "uploading" as const,
        localPreview: f.preview,
      }));

      setImages((prev) => [...prev, ...newItems]);

      newItems.forEach((item, index) => {
        void uploadFile(validFiles[index].file, item.clientId);
      });
    },
    [images.length, maxImages, uploadFile]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files.length > 0) {
        addFiles(e.dataTransfer.files);
      }
    },
    [addFiles]
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        addFiles(e.target.files);
      }
      if (inputRef.current) inputRef.current.value = "";
    },
    [addFiles]
  );

  const removeImage = useCallback(
    (index: number) => {
      const item = images[index];
      if (!item) return;

      URL.revokeObjectURL(item.localPreview);

      if (item.status === "uploading") {
        removedDuringUploadRef.current.add(item.clientId);
      }

      if (item.status === "done") {
        void deleteTempImage({ storageId: item.storageId }).catch(() => {
          // 업로더에서 이미 제거된 상태이므로 UI는 유지하고 서버 정리는 TTL에 맡깁니다.
        });
      }

      setImages((prev) => prev.filter((_, i) => i !== index));
    },
    [deleteTempImage, images]
  );

  const moveImage = useCallback(
    (index: number, direction: "up" | "down") => {
      setImages((prev) => {
        const targetIndex = direction === "up" ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= prev.length) return prev;
        const updated = [...prev];
        [updated[index], updated[targetIndex]] = [
          updated[targetIndex],
          updated[index],
        ];
        return updated;
      });
    },
    []
  );

  return (
    <div className="w-full space-y-3">
      {/* 썸네일 그리드 */}
      {images.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {images.map((img, i) => (
            <div
              key={img.clientId}
              className="group relative aspect-square overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800"
            >
              <img
                src={img.localPreview}
                alt={`이미지 ${i + 1}`}
                className="h-full w-full object-cover"
              />

              {/* 순번 */}
              <span className="absolute top-1.5 left-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-[10px] font-bold text-white">
                {i + 1}
              </span>

              {/* 업로드 중 스피너 */}
              {img.status === "uploading" && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                </div>
              )}

              {/* 에러 오버레이 */}
              {img.status === "error" && (
                <div className="absolute inset-0 flex items-center justify-center bg-red-500/40">
                  <span className="text-xs font-medium text-white">실패</span>
                </div>
              )}

              {/* 삭제 버튼 (호버 시 표시) */}
              <button
                onClick={() => removeImage(i)}
                className="absolute top-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity hover:bg-red-600 group-hover:opacity-100"
              >
                <svg
                  className="h-3 w-3"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>

              {/* 위/아래 이동 버튼 (호버 시 하단에 표시) */}
              <div className="absolute bottom-1.5 left-1/2 flex -translate-x-1/2 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  onClick={() => moveImage(i, "up")}
                  disabled={i === 0}
                  className="flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 disabled:opacity-30"
                >
                  <svg
                    className="h-3 w-3"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 15l7-7 7 7"
                    />
                  </svg>
                </button>
                <button
                  onClick={() => moveImage(i, "down")}
                  disabled={i === images.length - 1}
                  className="flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 disabled:opacity-30"
                >
                  <svg
                    className="h-3 w-3"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 이미지 수 카운터 */}
      {images.length > 0 && (
        <p className="text-xs text-zinc-400 dark:text-zinc-500">
          {images.length} / {maxImages} 장
        </p>
      )}

      {/* 드롭존 */}
      {images.length < maxImages && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 transition-colors ${
            dragOver
              ? "border-blue-400 bg-blue-50 dark:border-blue-500 dark:bg-blue-950"
              : "border-zinc-300 bg-zinc-50 hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:border-zinc-500"
          }`}
        >
          <svg
            className="mb-2 h-7 w-7 text-zinc-400 dark:text-zinc-500"
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
            JPG, PNG, GIF, WebP (최대 5MB, {maxImages}장까지)
          </p>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(",")}
        multiple
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
}
