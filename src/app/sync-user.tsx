"use client";

import { useUser } from "@clerk/nextjs";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useEffect } from "react";

/**
 * 로그인한 사용자를 감지하여 Convex users 테이블에 자동 저장하는 컴포넌트.
 * 렌더링 출력 없이 사이드이펙트만 수행합니다.
 */
export default function SyncUser() {
  const { user, isLoaded } = useUser();
  const upsertUser = useMutation(api.users.upsertUser);

  useEffect(() => {
    if (!isLoaded || !user) return;
    upsertUser();
  }, [isLoaded, user, upsertUser]);

  return null;
}
