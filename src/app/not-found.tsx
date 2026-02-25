import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <div className="text-center">
        <p className="mb-2 text-sm text-zinc-500 dark:text-zinc-400">404</p>
        <h2 className="mb-6 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          페이지를 찾을 수 없습니다
        </h2>
        <Link
          href="/"
          className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          홈으로
        </Link>
      </div>
    </div>
  );
}
