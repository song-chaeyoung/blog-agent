import { NextResponse } from "next/server";
import {
  importNaverBlogPostFromUrl,
  NaverImportError,
} from "@/lib/naverImport";

export const runtime = "nodejs";

type RequestBody = {
  url?: unknown;
};

function getStatusCode(errorCode: NaverImportError["code"]): number {
  switch (errorCode) {
    case "INVALID_URL":
    case "UNSUPPORTED_URL":
      return 400;
    case "FETCH_FAILED":
      return 502;
    case "CONTENT_NOT_FOUND":
      return 422;
    default:
      return 500;
  }
}

export async function POST(request: Request) {
  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json(
      { error: "요청 본문(JSON)을 읽을 수 없습니다." },
      { status: 400 },
    );
  }

  const rawUrl = body.url;
  if (typeof rawUrl !== "string") {
    return NextResponse.json(
      { error: "url 문자열을 요청 본문에 포함해 주세요." },
      { status: 400 },
    );
  }

  try {
    const imported = await importNaverBlogPostFromUrl(rawUrl);
    return NextResponse.json(imported);
  } catch (error) {
    if (error instanceof NaverImportError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: getStatusCode(error.code) },
      );
    }

    return NextResponse.json(
      { error: "URL 임포트 처리 중 알 수 없는 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
