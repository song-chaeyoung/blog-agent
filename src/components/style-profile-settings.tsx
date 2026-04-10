"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "../../convex/_generated/api";

const OPENING_MODE_OPTIONS = [
  { value: "off", label: "사용 안 함" },
  { value: "preferred", label: "선호" },
  { value: "strict", label: "강제" },
] as const;

export default function StyleProfileSettings() {
  const [openingMode, setOpeningMode] = useState<"off" | "preferred" | "strict">(
    "off"
  );
  const [fixedOpening, setFixedOpening] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const styleProfile = useQuery(api.styleProfiles.getMyStyleProfile);
  const upsertStyleProfile = useMutation(api.styleProfiles.upsertMyStyleProfile);
  const isStyleProfileLoading = styleProfile === undefined;

  useEffect(() => {
    if (!styleProfile) return;
    setOpeningMode(styleProfile.openingMode);
    setFixedOpening(styleProfile.fixedOpening ?? "");
  }, [styleProfile]);

  const handleSaveStyleProfile = async () => {
    if (isStyleProfileLoading) {
      toast.error("문체 설정을 불러오는 중입니다. 잠시 후 다시 시도해 주세요.");
      return;
    }
    if (openingMode === "strict" && fixedOpening.trim().length === 0) {
      toast.error("강제 모드에서는 고정 시작문을 입력해 주세요.");
      return;
    }
    setSavingProfile(true);
    try {
      await upsertStyleProfile({
        openingMode,
        fixedOpening: fixedOpening.trim() || undefined,
      });
      toast.success("문체 설정을 저장했습니다.");
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "문체 설정 저장 중 오류가 발생했습니다."
      );
    } finally {
      setSavingProfile(false);
    }
  };

  return (
    <section className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900/60">
      <h2 className="mb-2 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
        도입구/문체 설정
      </h2>
      <p className="mb-3 text-xs text-zinc-600 dark:text-zinc-400">
        사용자 기본 문체를 저장합니다. 생성 화면 전체에 공통 적용됩니다.
      </p>
      <div className="mb-2 grid grid-cols-3 gap-2 text-xs">
        {OPENING_MODE_OPTIONS.map((mode) => (
          <button
            key={mode.value}
            type="button"
            onClick={() => setOpeningMode(mode.value)}
            className={`rounded border px-2 py-1 ${
              openingMode === mode.value
                ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                : "border-zinc-300 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
            }`}
          >
            {mode.label}
          </button>
        ))}
      </div>
      {openingMode !== "off" && (
        <input
          type="text"
          value={fixedOpening}
          onChange={(e) => setFixedOpening(e.target.value)}
          placeholder="예: 안녕하세요! 맛집 다니는 유자입니다🥰"
          className="mb-2 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 placeholder-zinc-400 outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:placeholder-zinc-500 dark:focus:border-zinc-500"
        />
      )}
      <button
        type="button"
        onClick={handleSaveStyleProfile}
        disabled={savingProfile || isStyleProfileLoading}
        className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
      >
        {savingProfile
          ? "저장 중..."
          : isStyleProfileLoading
            ? "문체 설정 로딩 중..."
            : "문체 설정 저장"}
      </button>
    </section>
  );
}
