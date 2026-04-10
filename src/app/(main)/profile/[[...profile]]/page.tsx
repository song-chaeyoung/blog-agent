"use client";

import { UserProfile } from "@clerk/nextjs";
import StyleProfileSettings from "@/components/style-profile-settings";

export default function ProfilePage() {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
        프로필 설정
      </h2>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        계정 정보와 문체 설정을 한 화면에서 관리합니다.
      </p>
      {/* <div className="overflow-visible rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
        <UserProfile path="/profile" routing="path" />
      </div> */}
      <StyleProfileSettings />
    </div>
  );
}
