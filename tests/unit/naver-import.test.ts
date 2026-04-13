import { describe, expect, it } from "vitest";
import {
  extractMainFrameUrlFromHtml,
  extractNaverBlogTextFromHtml,
  normalizeNaverBlogPostUrl,
  NaverImportError,
} from "../../src/lib/naverImport";

describe("naver import utils", () => {
  it("normalizes /{blogId}/{logNo} url into canonical PostView url", () => {
    const normalized = normalizeNaverBlogPostUrl(
      "https://blog.naver.com/my_blog_1/223754993139",
    );

    expect(normalized.blogId).toBe("my_blog_1");
    expect(normalized.logNo).toBe("223754993139");
    expect(normalized.canonicalUrl).toBe(
      "https://blog.naver.com/PostView.naver?blogId=my_blog_1&logNo=223754993139",
    );
    expect(normalized.mobileUrl).toBe(
      "https://m.blog.naver.com/my_blog_1/223754993139",
    );
  });

  it("extracts mainFrame src as absolute url", () => {
    const html = `
      <html>
        <body>
          <iframe id="mainFrame" src="/PostView.naver?blogId=test_blog&logNo=1234567890"></iframe>
        </body>
      </html>
    `;

    const frameUrl = extractMainFrameUrlFromHtml(
      html,
      "https://blog.naver.com/test_blog/1234567890",
    );
    expect(frameUrl).toBe(
      "https://blog.naver.com/PostView.naver?blogId=test_blog&logNo=1234567890",
    );
  });

  it("extracts mainFrame src regardless of attribute order", () => {
    const html = `
      <html>
        <body>
          <iframe src="/PostView.naver?blogId=test_blog&logNo=1234567890" name="mainFrame"></iframe>
        </body>
      </html>
    `;

    const frameUrl = extractMainFrameUrlFromHtml(
      html,
      "https://blog.naver.com/test_blog/1234567890",
    );
    expect(frameUrl).toBe(
      "https://blog.naver.com/PostView.naver?blogId=test_blog&logNo=1234567890",
    );
  });

  it("extracts readable text from se-main-container", () => {
    const html = `
      <html>
        <body>
          <div id="postViewArea">
            <div class="se-main-container">
              <p>첫 문장입니다.</p>
              <p>둘째 문장입니다.<br>줄바꿈도 있습니다.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const text = extractNaverBlogTextFromHtml(html);
    expect(text).toContain("첫 문장입니다.");
    expect(text).toContain("둘째 문장입니다.");
    expect(text).toContain("줄바꿈도 있습니다.");
  });

  it("rejects non-naver host", () => {
    try {
      normalizeNaverBlogPostUrl("https://example.com/post/1");
      throw new Error("expected normalizeNaverBlogPostUrl to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(NaverImportError);
      if (error instanceof NaverImportError) {
        expect(error.code).toBe("UNSUPPORTED_URL");
      }
    }
  });
});
