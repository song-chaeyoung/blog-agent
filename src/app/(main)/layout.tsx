"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignInButton, UserButton, useUser } from "@clerk/nextjs";
import { Toaster } from "sonner";

const tabs = [
  { href: "/posts", label: "글 목록" },
  { href: "/import", label: "글 임포트" },
  { href: "/generate", label: "글 생성" },
];

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isSignedIn, isLoaded } = useUser();
  const pathname = usePathname();

  if (!isLoaded) return null;

  return (
    <div className="flex min-h-screen items-start justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="w-full max-w-2xl px-6 py-12">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-6">
          <Link
            href="/"
            className="text-2xl font-bold text-zinc-900 dark:text-zinc-50"
          >
            CopyMe
          </Link>
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

        {/* 탭 네비게이션 */}
        {isSignedIn && (
          <nav className="mb-8 flex gap-1 rounded-lg border border-zinc-200 bg-white p-1 dark:border-zinc-800 dark:bg-zinc-900">
            {tabs.map((tab) => {
              const isActive =
                pathname === tab.href || pathname.startsWith(tab.href + "/");
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`flex-1 rounded-md px-3 py-2 text-center text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                      : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                  }`}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        )}

        {isSignedIn ? (
          children
        ) : (
          <div className="text-center py-20">
            <p className="text-zinc-500 dark:text-zinc-400">
              로그인하면 글을 임포트할 수 있습니다.
            </p>
          </div>
        )}
      </main>
      <Toaster richColors position="bottom-center" />
    </div>
  );
}
