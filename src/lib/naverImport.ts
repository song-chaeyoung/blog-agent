import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export type NaverImportErrorCode =
  | "INVALID_URL"
  | "UNSUPPORTED_URL"
  | "FETCH_FAILED"
  | "CONTENT_NOT_FOUND"
  | "FORBIDDEN_URL";

export class NaverImportError extends Error {
  constructor(
    public readonly code: NaverImportErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "NaverImportError";
  }
}

export type NormalizedNaverPostUrl = {
  blogId: string;
  logNo: string;
  canonicalUrl: string;
  mobileUrl: string;
};

export type ImportedNaverPost = {
  canonicalUrl: string;
  sourceUrl: string;
  title: string | null;
  content: string;
};

const NAVER_BLOG_HOSTS = new Set(["blog.naver.com", "m.blog.naver.com"]);
const BLOG_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{1,49}$/;
const LOG_NO_PATTERN = /^\d{5,20}$/;
const MIN_EXTRACTED_CONTENT_LENGTH = 80;
const DEFAULT_FETCH_TIMEOUT_MS = 8_000;
const fetchTimeoutFromEnv = Number.parseInt(
  process.env.NAVER_IMPORT_FETCH_TIMEOUT_MS ?? "",
  10,
);
const FETCH_TIMEOUT_MS =
  Number.isFinite(fetchTimeoutFromEnv) && fetchTimeoutFromEnv > 0
    ? fetchTimeoutFromEnv
    : DEFAULT_FETCH_TIMEOUT_MS;

const NAVER_FETCH_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
};

const MAIN_FRAME_REGEX =
  /<iframe\b(?=[^>]*\b(?:id|name)=["']mainFrame["'])[^>]*\bsrc=["']([^"']+)["'][^>]*>/i;

const CONTENT_CONTAINER_PATTERNS = [
  /<(article|div)\b[^>]*id=["']postViewArea["'][^>]*>/i,
  /<(article|div)\b[^>]*class=["'][^"']*\bse-main-container\b[^"']*["'][^>]*>/i,
  /<(article|div)\b[^>]*class=["'][^"']*\bpost-view\b[^"']*["'][^>]*>/i,
  /<(article|div)\b[^>]*class=["'][^"']*\bpost_view\b[^"']*["'][^>]*>/i,
  /<(article|div)\b[^>]*class=["'][^"']*\bcontents_style\b[^"']*["'][^>]*>/i,
];

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  middot: "·",
  hellip: "...",
  ndash: "-",
  mdash: "-",
  rsquo: "'",
  lsquo: "'",
  ldquo: '"',
  rdquo: '"',
};

export function normalizeNaverBlogPostUrl(rawUrl: string): NormalizedNaverPostUrl {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    throw new NaverImportError("INVALID_URL", "URL을 입력해 주세요.");
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new NaverImportError("INVALID_URL", "올바른 URL 형식이 아닙니다.");
  }

  if (!NAVER_BLOG_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw new NaverImportError(
      "UNSUPPORTED_URL",
      "현재는 네이버 블로그 URL만 지원합니다.",
    );
  }

  const identifiers = extractPostIdentifiers(parsed);
  if (!identifiers) {
    throw new NaverImportError(
      "INVALID_URL",
      "블로그 아이디 또는 글 번호(logNo)를 URL에서 찾을 수 없습니다.",
    );
  }

  const canonicalUrl = new URL("https://blog.naver.com/PostView.naver");
  canonicalUrl.searchParams.set("blogId", identifiers.blogId);
  canonicalUrl.searchParams.set("logNo", identifiers.logNo);

  return {
    blogId: identifiers.blogId,
    logNo: identifiers.logNo,
    canonicalUrl: canonicalUrl.toString(),
    mobileUrl: `https://m.blog.naver.com/${identifiers.blogId}/${identifiers.logNo}`,
  };
}

export async function importNaverBlogPostFromUrl(
  rawUrl: string,
): Promise<ImportedNaverPost> {
  const normalized = normalizeNaverBlogPostUrl(rawUrl);
  const candidates = [normalized.canonicalUrl, normalized.mobileUrl];
  const visited = new Set<string>();

  let lastFetchError: NaverImportError | null = null;
  let fallbackTitle: string | null = null;

  for (const candidateUrl of candidates) {
    let safeCandidateUrl: string;
    try {
      safeCandidateUrl = await toSafeFetchTarget(candidateUrl);
    } catch (error) {
      if (error instanceof NaverImportError) {
        lastFetchError = error;
      }
      continue;
    }

    if (visited.has(safeCandidateUrl)) continue;
    visited.add(safeCandidateUrl);

    let html: string;
    try {
      html = await fetchHtml(safeCandidateUrl);
    } catch (error) {
      if (error instanceof NaverImportError) {
        lastFetchError = error;
      }
      continue;
    }

    const pagesToParse: Array<{ url: string; html: string }> = [
      { url: safeCandidateUrl, html },
    ];

    const frameUrl = extractMainFrameUrlFromHtml(html, safeCandidateUrl);
    if (frameUrl) {
      let safeFrameUrl: string | null = null;
      try {
        safeFrameUrl = await toSafeFetchTarget(frameUrl);
      } catch (error) {
        if (error instanceof NaverImportError) {
          lastFetchError = error;
        }
      }

      if (safeFrameUrl && !visited.has(safeFrameUrl)) {
        visited.add(safeFrameUrl);
        try {
          const frameHtml = await fetchHtml(safeFrameUrl);
          pagesToParse.push({ url: safeFrameUrl, html: frameHtml });
        } catch (error) {
          if (error instanceof NaverImportError) {
            lastFetchError = error;
          }
        }
      }
    }

    for (const page of pagesToParse) {
      const title = extractTitleFromHtml(page.html);
      if (title && !fallbackTitle) {
        fallbackTitle = title;
      }

      const body = extractNaverBlogTextFromHtml(page.html);
      if (body.length < MIN_EXTRACTED_CONTENT_LENGTH) continue;

      const mergedTitle = title ?? fallbackTitle;
      return {
        canonicalUrl: normalized.canonicalUrl,
        sourceUrl: page.url,
        title: mergedTitle,
        content: mergeTitleAndBody(mergedTitle, body),
      };
    }
  }

  if (lastFetchError) {
    throw lastFetchError;
  }

  throw new NaverImportError(
    "CONTENT_NOT_FOUND",
    "본문 추출에 실패했습니다. 공개된 네이버 블로그 글인지 확인해 주세요.",
  );
}

export function extractMainFrameUrlFromHtml(
  html: string,
  baseUrl: string,
): string | null {
  const match = MAIN_FRAME_REGEX.exec(html);
  const src = match?.[1];
  if (!src) {
    return null;
  }

  try {
    return new URL(src, baseUrl).toString();
  } catch {
    return null;
  }
}

export function extractNaverBlogTextFromHtml(html: string): string {
  const candidates = new Set<string>();

  for (const pattern of CONTENT_CONTAINER_PATTERNS) {
    const match = pattern.exec(html);
    if (!match || match.index === undefined) continue;

    const tagName = (match[1] ?? "div").toLowerCase();
    const fragment = extractBalancedElement(html, match.index, tagName);
    if (!fragment) continue;

    const text = sanitizeExtractedText(fragmentToText(fragment));
    if (text.length > 0) {
      candidates.add(text);
    }
  }

  if (candidates.size === 0) {
    const bodyMatch = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(html);
    if (bodyMatch?.[1]) {
      const bodyText = sanitizeExtractedText(fragmentToText(bodyMatch[1]));
      if (bodyText.length > 0) {
        candidates.add(bodyText);
      }
    }
  }

  return [...candidates].sort((a, b) => b.length - a.length)[0] ?? "";
}

function extractPostIdentifiers(
  parsedUrl: URL,
): { blogId: string; logNo: string } | null {
  const queryBlogId = parsedUrl.searchParams.get("blogId")?.trim() ?? "";
  const queryLogNo = parsedUrl.searchParams.get("logNo")?.trim() ?? "";

  if (isValidBlogId(queryBlogId) && isValidLogNo(queryLogNo)) {
    return { blogId: queryBlogId, logNo: queryLogNo };
  }

  const segments = parsedUrl.pathname
    .split("/")
    .filter(Boolean)
    .map((segment) => safeDecode(segment).trim());

  if (segments.length >= 2) {
    const logNo = segments[segments.length - 1];
    const blogId = segments[segments.length - 2];
    if (isValidBlogId(blogId) && isValidLogNo(logNo)) {
      return { blogId, logNo };
    }
  }

  return null;
}

function isValidBlogId(blogId: string): boolean {
  return BLOG_ID_PATTERN.test(blogId);
}

function isValidLogNo(logNo: string): boolean {
  return LOG_NO_PATTERN.test(logNo);
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

async function fetchHtml(url: string): Promise<string> {
  const safeUrl = await toSafeFetchTarget(url);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(safeUrl, {
      method: "GET",
      headers: NAVER_FETCH_HEADERS,
      redirect: "follow",
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new NaverImportError(
        "FETCH_FAILED",
        "네이버 페이지 요청 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.",
      );
    }
    throw new NaverImportError(
      "FETCH_FAILED",
      "네이버 페이지에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    );
  } finally {
    clearTimeout(timeoutId);
  }

  await toSafeFetchTarget(response.url);

  if (!response.ok) {
    throw new NaverImportError(
      "FETCH_FAILED",
      `네이버 페이지 요청이 실패했습니다. (HTTP ${response.status})`,
    );
  }

  return await response.text();
}

async function toSafeFetchTarget(rawUrl: string): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new NaverImportError("INVALID_URL", "유효하지 않은 URL입니다.");
  }

  const host = parsed.hostname.toLowerCase();
  if (parsed.protocol !== "https:") {
    throw new NaverImportError(
      "FORBIDDEN_URL",
      "보안을 위해 https URL만 허용됩니다.",
    );
  }
  if (!NAVER_BLOG_HOSTS.has(host)) {
    throw new NaverImportError(
      "FORBIDDEN_URL",
      "허용되지 않은 호스트로의 요청은 차단됩니다.",
    );
  }

  await assertPublicHostAddress(host);
  return parsed.toString();
}

async function assertPublicHostAddress(hostname: string): Promise<void> {
  const normalizedHost = hostname.trim().toLowerCase();
  if (!normalizedHost || normalizedHost === "localhost") {
    throw new NaverImportError(
      "FORBIDDEN_URL",
      "로컬 주소로의 요청은 허용되지 않습니다.",
    );
  }

  const ipVersion = isIP(normalizedHost);
  let addresses: string[];
  if (ipVersion === 0) {
    try {
      addresses = (
        await lookup(normalizedHost, {
          all: true,
          verbatim: true,
        })
      ).map((entry) => entry.address);
    } catch {
      throw new NaverImportError(
        "FETCH_FAILED",
        "대상 호스트의 DNS 해석에 실패했습니다.",
      );
    }
  } else {
    addresses = [normalizedHost];
  }

  if (addresses.length === 0) {
    throw new NaverImportError(
      "FETCH_FAILED",
      "대상 호스트의 DNS 해석에 실패했습니다.",
    );
  }

  for (const address of addresses) {
    if (isPrivateOrLoopbackAddress(address)) {
      throw new NaverImportError(
        "FORBIDDEN_URL",
        "보안 정책상 비공개/로컬 네트워크 주소로의 요청은 허용되지 않습니다.",
      );
    }
  }
}

function isPrivateOrLoopbackAddress(address: string): boolean {
  const normalized = address.trim().toLowerCase().split("%")[0];
  const ipVersion = isIP(normalized);
  if (ipVersion === 4) {
    return isPrivateOrLoopbackIpv4(normalized);
  }
  if (ipVersion === 6) {
    return isPrivateOrLoopbackIpv6(normalized);
  }
  return false;
}

function isPrivateOrLoopbackIpv4(address: string): boolean {
  const octets = address.split(".").map((octet) => Number.parseInt(octet, 10));
  if (
    octets.length !== 4 ||
    octets.some((value) => Number.isNaN(value) || value < 0 || value > 255)
  ) {
    return false;
  }

  const [a, b] = octets;
  if (a === 0) return true;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function isPrivateOrLoopbackIpv6(address: string): boolean {
  if (address === "::" || address === "::1") {
    return true;
  }

  const mappedIpv4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address)?.[1];
  if (mappedIpv4) {
    return isPrivateOrLoopbackIpv4(mappedIpv4);
  }

  if (address.startsWith("fc") || address.startsWith("fd")) {
    return true;
  }
  if (
    address.startsWith("fe8") ||
    address.startsWith("fe9") ||
    address.startsWith("fea") ||
    address.startsWith("feb")
  ) {
    return true;
  }
  return false;
}

function extractBalancedElement(
  html: string,
  startIndex: number,
  tagName: string,
): string | null {
  const openTagRegex = new RegExp(`^<${tagName}\\b[^>]*>`, "i");
  const sliced = html.slice(startIndex);
  const openTagMatch = openTagRegex.exec(sliced);
  if (!openTagMatch) return null;

  const openTagLength = openTagMatch[0].length;
  const sameTagRegex = new RegExp(`<\\/?${tagName}\\b[^>]*>`, "gi");
  sameTagRegex.lastIndex = startIndex + openTagLength;

  let depth = 1;
  let match: RegExpExecArray | null;
  while ((match = sameTagRegex.exec(html)) !== null) {
    const token = match[0];
    const isClosing = token.startsWith("</");
    const isSelfClosing = /\/>$/.test(token);

    if (!isClosing && !isSelfClosing) depth += 1;
    if (isClosing) depth -= 1;

    if (depth === 0) {
      return html.slice(startIndex, sameTagRegex.lastIndex);
    }
  }

  return null;
}

function fragmentToText(fragment: string): string {
  return fragment
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|iframe)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(
      /<\/(p|div|section|article|h[1-6]|li|ul|ol|table|tr|blockquote)>/gi,
      "\n",
    )
    .replace(/<(p|div|section|article|h[1-6]|li|blockquote)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
}

function sanitizeExtractedText(rawText: string): string {
  const decoded = decodeHtmlEntities(rawText);

  return decoded
    .replace(/\u00A0/g, " ")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line) => line.length > 0)
    .join("\n")
    .trim();
}

function decodeHtmlEntities(input: string): string {
  return input.replace(
    /&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g,
    (entity, body: string) => {
      const lower = body.toLowerCase();
      if (lower in NAMED_ENTITIES) {
        return NAMED_ENTITIES[lower];
      }

      if (lower.startsWith("#x")) {
        const codePoint = Number.parseInt(lower.slice(2), 16);
        return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : entity;
      }

      if (lower.startsWith("#")) {
        const codePoint = Number.parseInt(lower.slice(1), 10);
        return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : entity;
      }

      return entity;
    },
  );
}

function extractTitleFromHtml(html: string): string | null {
  const ogTitlePatterns = [
    /<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["'][^>]*>/i,
  ];

  for (const regex of ogTitlePatterns) {
    const match = regex.exec(html);
    if (!match?.[1]) continue;
    const normalized = normalizeTitle(match[1]);
    if (normalized) return normalized;
  }

  const titleMatch = /<title[^>]*>([^<]+)<\/title>/i.exec(html);
  if (!titleMatch?.[1]) return null;

  return normalizeTitle(titleMatch[1]);
}

function normalizeTitle(raw: string): string | null {
  const decoded = decodeHtmlEntities(raw)
    .replace(/\s*:\s*네이버\s*블로그\s*$/i, "")
    .replace(/[ \t]+/g, " ")
    .trim();

  return decoded.length > 0 ? decoded : null;
}

function mergeTitleAndBody(title: string | null, body: string): string {
  if (!title) return body;
  if (body.startsWith(title)) return body;
  return `${title}\n\n${body}`;
}
