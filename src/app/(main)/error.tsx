"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="py-20 text-center">
      <h2 className="mb-2 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
        오류가 발생했습니다
      </h2>
      <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">
        {error.message || "알 수 없는 오류입니다."}
      </p>
      <button
        onClick={reset}
        className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        다시 시도
      </button>
    </div>
  );
}
