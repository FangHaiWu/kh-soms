import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { chromium, Browser, BrowserContext } from 'playwright';
import { FacebookAccountManager } from '@modules/osint/services/facebook/facebook-account-manager.service';
import { OsintFacebookAccount } from '@modules/osint/entities/osint-facebook-account.entity';
import { RawPost } from '../collectors/raw-post.interface';
@Injectable()
export class FacebookCollector {
  private readonly logger = new Logger(FacebookCollector.name);
  constructor(
    private readonly configService: ConfigService,
    private readonly accountManager: FacebookAccountManager,
  ) {}

  // Mở Chromium với cờ anti-detect. Trả Browser - Caller phải close trong finally (rò RAM)
  private async launchBrowser(): Promise<Browser> {
    const headless = this.configService.get('FB_HEADLESS') === 'true';
    const proxyURL = this.configService.get('FB_PROXY_URL');

    return await chromium.launch({
      headless,
      args: [
        '--disable-blink-features=AutomationControlled', // Cờ quan trọng nhất: tắt navigator .webdriver ở tầng browser
        '--no-sandbox',
        '--disable-dev-shm-usage',
      ],
      proxy: proxyURL ? { server: proxyURL } : undefined, // proxy-ready: cắm vào env để không cần sửa code
    });
  }

  // Tạo context "giống người": viewport/UA random, locale + timzone VN .storageState để khôi pục session
  private async newStealthContext(
    browser: Browser,
    storageState?: string,
  ): Promise<BrowserContext> {
    const context = await browser.newContext({
      viewport: {
        width: Number(this.configService.get('FB_VIEWPORT_WIDTH')) || 1920,
        height: Number(this.configService.get('FB_VIEWPORT_HEIGHT')) || 1080,
      },
      userAgent:
        this.configService.get('FB_USER_AGENT') ??
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'vi-VN',
      timezoneId: 'Asia/Ho_Chi_Minh',
      storageState: storageState ? JSON.parse(storageState) : undefined,
    });

    // Tầng 2 (sau cờ launch): che các dấu hiệu còn sót
    await context.addInitScript(() => {
      // navigator.language,
      // navigator.plugins,
    });

    return context;
  }

  // SMOKE tạm -> Xóa sau
  async smokeTest(): Promise<void> {
    const browser = await this.launchBrowser();
    try {
      const context = await this.newStealthContext(browser);
      const page = await context.newPage();
      await page.goto('https://www.facebook.com/', {
        waitUntil: 'domcontentloaded',
      });
      const webdriver = await page.evaluate(() => (navigator as any).webdriver);
      this.logger.log(
        `navigator.webdriver: ${webdriver} (ky vong: false or underfined)`,
      );
    } finally {
      await browser.close(); // Bat buoc -> kill browser moi lan (spec G: playwright ro RAM)
    }
  }

  // Chunk 2:
  /* 
    getAuthenticatedContext(browser, account):
          ├─ Có session đã lưu? ──YES──> giải mã → newContext({storageState}) → CÒN đăng nhập? ──YES──> dùng luôn ✅
          │                                                                       └─NO (hết hạn)─┐
          └─NO────────────────────────────────────────────────────────────────────────────────┤
                                                                                        ▼
                                                          login(form) → THÀNH CÔNG? ──YES──> lưu session (mã hóa) ✅
                                                                          ├─CHECKPOINT──> markCheckpoint() → ném lỗi êm
                                                                          └─SAI PW──────> ném lỗi rõ
  
    Ý tưởng cốt lõi: ưu tiên khôi phục session cũ, 
    chỉ login bằng form khi bắt buộc — vì mỗi lần login mới là hành vi đáng ngờ nhất với FB.
    2a — đưa acct thật vào DB + viết login() (điền form, phát hiện kết quả). ← làm trước
    2b — export storageState → mã hóa → lưu encrypted_session (thêm method vào AccountManager).
    2c — khôi phục session lần sau (bỏ qua login nếu session còn sống).
  */

  // 2a. login()
  // Đăng nhập bằng form -> TRả success | checkpoint | failed
  // Không throw cho checkpoint/failed -> caller quyết định xử lý (markCheckpoint/log)

  private async login(
    context: BrowserContext,
    loginId: string,
    password: string,
  ): Promise<'success' | 'checkpoint' | 'failed'> {
    const page = await context.newPage();
    // 1. Mở trang login (domcontentload), không networkidle)
    await page.goto('https://www.facebook.com/login/', {
      waitUntil: 'domcontentloaded',
    });
    // 2. fill email -> fill pass -> click login

    await page.fill('input[name="email"]', loginId);
    await page.fill('input[name="pass"]', password);

    // FB www KHÔNG submit bằng Enter (nút là <div> có JS handler, không phải <form> native).
    // Click nút "Đăng nhập" theo role+text — bền hơn selector cấu trúc (FB random class/bỏ name).
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    // 3. Chờ điều hướng xong: await page.waitForNavigation();
    await page.waitForLoadState('domcontentloaded');
    // thêm randomDelay 3–6s (FB cần lúc xử lý; cũng giống nhịp người)
    await page.waitForTimeout(
      Math.floor(Math.random() * (6000 - 3000 + 1)) + 3000,
    );
    // 4. Kiểm checkpoint trước
    // 4. Checkpoint TRƯỚC — dùng includes vì URL có query string
    const url = page.url(); // page.url() đồng bộ, bỏ await cũng được
    if (url.includes('/checkpoint') || url.includes('two_step_verification')) {
      return 'checkpoint';
    }

    // 5. Tín hiệu CHẮC CHẮN: cookie c_user (FB chỉ set khi đã đăng nhập)
    const cookies = await context.cookies(); // dùng context (có sẵn param), gọn hơn page.context()
    const loggedIn = cookies.some((c) => c.name === 'c_user');
    return loggedIn ? 'success' : 'failed';
  }

  // Trả về 1 BrowserContext đã đăng nhập để sắn sàng cào dữ liệu
  // Ưu tiên session đã lưu -> Không có/ hết hạn -> caller sở hữu browser (đóng ở finally)
  async getAuthenticatedContext(
    browser: Browser,
    account: OsintFacebookAccount,
  ): Promise<BrowserContext> {
    // 1. Đăng nhập với session đã lưu
    const saved = await this.accountManager.getSession(account.id);
    if (saved) {
      const context = await this.newStealthContext(browser, saved);
      // 1. Kiểm tra session còn sống: mở fb -> xem có bị đá về /login không + còn c_user không
      if (await this.isSessionAlive(context)) {
        this.logger.log(`[${account.label}] dùng lại session đã lưu`);
        return context;
      }
      await context.close(); // session hết hạn -> close context
      this.logger.warn(`[${account.label}] session hết hạn, login bằng form`);
    }

    // 2. Session không có/ hết hạn, login bằng form
    const context = await this.newStealthContext(browser);
    const { loginIdentifier, password } =
      await this.accountManager.getCredentials(account.id);
    const result = await this.login(context, loginIdentifier, password);
    if (result === 'checkpoint') {
      await this.accountManager.markCheckpoint(account.id);
      throw new Error(`[${account.label}] dính checkpoint khi login`);
    }
    if (result === 'failed') {
      throw new Error(`[${account.label}] login thất bại`);
    }
    // 3. success -> EXPORT storageState -> lưu (mã hóa) để lần sau khỏi login
    const state = await context.storageState();
    await this.accountManager.saveSession(account.id, JSON.stringify(state));
    this.logger.log(`[${account.label}] login thành công`);
    return context;
  }

  // Helper kieerm tra session còn sống không
  private async isSessionAlive(context: BrowserContext): Promise<boolean> {
    const page = await context.newPage();
    try {
      await page.goto('https://www.facebook.com/', {
        waitUntil: 'domcontentloaded',
      });
      // Bị đá về /login -> hết hạn
      if (page.url().includes('/login')) {
        return false;
      }
      // Còn cookie c_user sau khi load -> coi như còn đăng nhập
      const cookies = await context.cookies();
      return cookies.some((c) => c.name === 'c_user');
    } finally {
      await page.close(); // đóng page kiểm tra, giữ context dùng tiếp
    }
  }

  // ─── TẠM (Chunk 2a verify) — sẽ được thay bằng getAuthenticatedContext ở 2c, có thể xóa ───
  // Mở browser anti-detect → context → login bằng form → trả kết quả → đóng browser (finally).
  async verifyLogin(
    loginId: string,
    password: string,
  ): Promise<'success' | 'checkpoint' | 'failed'> {
    const browser = await this.launchBrowser();
    try {
      const context = await this.newStealthContext(browser);
      return await this.login(context, loginId, password);
    } finally {
      await browser.close(); // kill browser mỗi lần (spec G)
    }
  }

  private async scrapeGroupPostIds(
    context: BrowserContext,
    entryUrl: string,
  ): Promise<{ externalPostId: string; postUrl: string }[]> {
    const page = await context.newPage();
    try {
      // 1. Mở trang + chờ feed
      await page.goto(entryUrl, {
        waitUntil: 'domcontentloaded',
      });
      await page.waitForSelector('div[role="article"]', { timeout: 15000 });

      // 2. Bóc mọi permalink đang có trên trang -> mảng {externalPostId, postUrl}
      const extractNow = () => {
        return page.evaluate(() => {
          const anchors = Array.from(document.querySelectorAll('a[href]'));
          const out: { externalPostId: string; postUrl: string }[] = [];
          for (const a of anchors) {
            const href = (a as HTMLAnchorElement).href;
            const m =
              href.match(/\/posts\/(pfbid[\w-]+|\d+)/) ||
              href.match(/\/permalink\/(\d+)/) ||
              href.match(/multi_permalinks=(\d+)/) ||
              href.match(/story_fbid=(pfbid[\w-]+|\d+)/);
            if (m)
              out.push({ externalPostId: m[1], postUrl: href.split('?')[0] });
          }
          return out;
        });
      };
      const map = new Map<
        string,
        { externalPostId: string; postUrl: string }
      >();
      const maxScrolls = Number(this.configService.get('FB_MAX_SCROLLS')) || 8;
      let stale = 0;
      for (let i = 0; i < maxScrolls; i++) {
        const before = map.size;
        // Bóc post hiện có -> dồn vào map (cùng id thì đè, tự dedup)
        const found = await extractNow();
        for (const item of found) map.set(item.externalPostId, item);
        // Không có post mới 2 vòng liên -> hết bài -> dừng sớm
        if (map.size === before) stale++;
        else stale = 0;
        if (stale >= 2) break;
        // Cuộn xuống đáy để FB tải thêm + chờ giống người cuộn
        await page.evaluate(() =>
          window.scrollTo(0, document.body.scrollHeight),
        );
        await page.waitForTimeout(Math.floor(Math.random() * 2000) + 2000);
      }
      this.logger.log(`[${entryUrl}] thu ${map.size} post ID distinct`);
      return [...map.values()];
    } finally {
      await page.close();
    }
  }

  /**
   * 3a-ii: Vào trang permalink của 1 post → bóc {content, author} CỦA ĐÚNG post đó → RawPost.
   * Trả null nếu post lỗi/xóa/timeout — KHÔNG throw (để 1 post hỏng không chặn cả mẻ).
   *
   * Bài toán khó: trang permalink GROUP render NHIỀU post (post mục tiêu + post gợi ý) →
   * không thể "lấy message đầu tiên". Phải NEO THEO target.externalPostId — chỉ nhận
   * message nào nằm trong khối có link /posts/<đúng id>.
   */
  private async scrapePostDetail(
    context: BrowserContext,
    target: { externalPostId: string; postUrl: string },
  ): Promise<RawPost | null> {
    const page = await context.newPage();
    try {
      // VD target: { externalPostId: '1722345968791242', postUrl: '.../posts/1722345968791242/' }
      await page.goto(target.postUrl, { waitUntil: 'domcontentloaded' });

      // Chờ ít nhất 1 message hiện. Quá 12s = post xóa/lỗi → throw → catch → null.
      // (KHÔNG networkidle vì FB không bao giờ idle.)
      await page.waitForSelector('div[data-ad-preview="message"]', {
        timeout: 12000,
      });
      // Permalink mở post trong MODAL — message TRONG modal load CHẬM hơn message feed.
      // waitForSelector ở trên có thể pass nhờ message FEED trong khi modal chưa render → đọc ra null.
      // Chờ riêng message trong modal. .catch nuốt: FB đôi khi render thẳng (không modal) → fallback document.
      await page
        .waitForSelector(
          'div[role="dialog"][aria-modal="true"] div[data-ad-preview="message"]',
          { timeout: 8000 },
        )
        .catch(() => {});
      // Bung tất cả "Xem thêm" để content không bị cắt. Click có thể fail (FB redraw) → catch nuốt.
      // Bung "Xem thêm" — khớp CẢ vi lẫn en (ngôn ngữ FB tùy cài đặt ACCOUNT, không chỉ locale).
      // Regex thì KHÔNG dùng ex:true; ^...$ để neo đúng nút bung nội dung, tránh khớp
      // "Xem thêm bình luận"/"View more comments" (nút khác).
      for (const btn of await page
        .getByRole('button', { name: /^(Xem thêm|See more)$/i })
        .all()) {
        try {
          await btn.click({ timeout: 1500 });
        } catch {}
      }
      await page.waitForTimeout(500); // chờ text bung
      // ────────── BÓC POST — scope vào MODAL (permalink mở post trong dialog, feed nằm sau lưng) ──────────
      // FB mở permalink dạng modal [role=dialog][aria-modal]; feed vẫn render phía sau → quét cả
      // trang sẽ LẪN post feed. Scope vào modal: trong đó có ĐÚNG 1 post = target (bỏ idMatch/leo-cây).
      const detail = await page.evaluate(() => {
        // Fallback document nếu FB render thẳng (không modal) — khi đó không có feed nên an toàn.
        const root: Element | Document =
          document.querySelector('div[role="dialog"][aria-modal="true"]') ??
          document;

        // countNear: đọc SỐ tương tác cạnh 1 nút action. Neo data-ad-rendering-role (không phụ
        // thuộc ngôn ngữ); marker rỗng → leo tới [role="button"] bao ngoài lấy innerText (vd "321").
        const countNear = (
          scope: Element | Document,
          role: string,
        ): string | null => {
          const marker = scope.querySelector(
            `[data-ad-rendering-role="${role}"]`,
          );
          if (!marker) return null;
          const btn = marker.closest('[role="button"]') || marker.parentElement;
          const t = btn ? (btn as HTMLElement).innerText.trim() : '';
          return t || null;
        };

        const msg = root.querySelector('div[data-ad-preview="message"]');
        if (!msg) return null;
        const authorA = root.querySelector(
          '[data-ad-rendering-role="profile_name"] a',
        ) as HTMLAnchorElement | null;
        return {
          content: (msg as HTMLElement).innerText,
          authorName: authorA
            ? (authorA.textContent || '').trim().slice(0, 200)
            : null,
          authorHref: authorA ? authorA.href : null,
          likeRaw: countNear(root, 'like_button'),
          commentRaw: countNear(root, 'comment_button'),
          shareRaw: countNear(root, 'share_button'),
        };
      });

      // Không tìm thấy post mục tiêu (modal trống / FB ẩn / đã xóa) → bỏ qua.
      if (!detail) return null;

      // ────────── authorExternalId Ở NODE (vanity HOẶC số) ──────────
      const authorExternalId = this.extractExternalId(detail.authorHref);

      // ────────── Load thêm comment — modal lazy-load, mới render vài cái đầu ──────────
      // Cuộn TRONG modal vài nhịp để FB render thêm comment (Sprint 4: scroll cố định, S5 tối ưu).
      for (let i = 0; i < 5; i++) {
        await page.evaluate(() => {
          const m = document.querySelector(
            'div[role="dialog"][aria-modal="true"]',
          );
          (m ?? document.scrollingElement)?.scrollBy(0, 2000);
        });
        await page.waitForTimeout(1200);
      }

      // ────────── Bóc COMMENT (3b) — neo aria-label (build vi-VN KHÔNG có data-commentid) ──────────
      const rawComments = await page.evaluate(() => {
        const root: Element | Document =
          document.querySelector('div[role="dialog"][aria-modal="true"]') ??
          document;
        const out: {
          externalCommentId: string;
          authorName: string | null;
          authorHref: string | null;
          content: string;
        }[] = [];
        // Comment article: vi "Bình luận dưới tên <tên> vào <giờ>" | en "Comment by <name>".
        const nodes = root.querySelectorAll(
          '[role="article"][aria-label^="Bình luận"], [role="article"][aria-label^="Comment by"]',
        );
        for (const n of Array.from(nodes)) {
          // external_comment_id: comment_id= có 2 dạng (base64 + numeric); CHỈ lấy NUMERIC (ổn định).
          const aCands = Array.from(
            n.querySelectorAll('a[href*="comment_id="]'),
          ) as HTMLAnchorElement[];
          let externalCommentId: string | null = null;
          for (const a of aCands) {
            const mm = a.href.match(/comment_id=(\d+)(?:&|$)/);
            if (mm) {
              externalCommentId = mm[1];
              break;
            }
          }
          if (!externalCommentId) continue;
          // authorName: bóc từ aria-label; authorHref = link CÓ TEXT (link tên người bình luận).
          const label = n.getAttribute('aria-label') || '';
          const mName =
            label.match(/dưới tên (.+?)\s+vào\s/) ||
            label.match(/Comment by (.+)$/);
          // authorHref: link tên người bình luận = link ĐẦU TIÊN có text. KHÔNG giới hạn comment_id
          // vì link profile group (/groups/<gid>/user/<uid>/) KHÔNG mang comment_id → nếu lọc theo
          // comment_id sẽ vớ nhầm link permalink (trỏ về POST) → authorExternalId ra id post.
          const nameLink =
            (
              Array.from(n.querySelectorAll('a[href]')) as HTMLAnchorElement[]
            ).find((x) => (x.textContent || '').trim()) || null;
          const authorName = mName
            ? mName[1].trim()
            : nameLink
              ? (nameLink.textContent || '').trim()
              : null;
          // Nội dung: div[dir="auto"] DÀI NHẤT — BỎ div nằm trong <a> (tên/timestamp nằm trong link,
          // nội dung comment thì KHÔNG) để không vớ nhầm tên tác giả khi comment ngắn hơn tên.
          let content = '';
          for (const d of Array.from(n.querySelectorAll('div[dir="auto"]'))) {
            if ((d as HTMLElement).closest('a')) continue;
            const t = (d as HTMLElement).innerText.trim();
            if (t.length > content.length) content = t;
          }
          if (!content) continue;
          out.push({
            externalCommentId,
            authorName,
            authorHref: nameLink ? nameLink.href : null,
            content,
          });
        }
        // Có thể lặp (article lồng / scroll) → distinct theo id.
        const seen = new Set<string>();
        return out.filter((c) =>
          seen.has(c.externalCommentId)
            ? false
            : (seen.add(c.externalCommentId), true),
        );
      });

      // ────────── Dựng RawPost (kèm engagement + comments) ──────────
      const rawPost: RawPost = {
        externalPostId: target.externalPostId,
        content: detail.content,
        authorName: detail.authorName,
        authorExternalId,
        engagement: {
          likes: this.parseCount(detail.likeRaw),
          commentCount: this.parseCount(detail.commentRaw),
          shares: this.parseCount(detail.shareRaw),
        },
        comments: rawComments.map((c) => ({
          externalCommentId: c.externalCommentId,
          authorName: c.authorName,
          authorExternalId: this.extractExternalId(c.authorHref),
          content: c.content,
          depth: 0, // draft: chưa phân biệt reply lồng — refine sau
        })),
        platformSpecificData: { postUrl: target.postUrl },
      };
      return rawPost;
    } catch {
      // Bất kỳ lỗi nào (timeout waitForSelector, navigation fail, evaluate throw) → trả null.
      // Caller (Pha 2 scrapeGroup) bỏ qua post này và tiếp post sau. KHÔNG crash cả mẻ.
      return null;
    } finally {
      // BẮT BUỘC đóng page — không thì leak. Browser do caller đóng (spec G).
      await page.close();
    }
  }

  // Bóc định danh profile từ href: /user/<số> | profile.php?id=<số> | vanity (/tênprofile).
  // Dùng cho cả tác giả post lẫn comment. null nếu href rỗng/không bóc được.
  private extractExternalId(href: string | null): string | null {
    if (!href) return null;
    const m =
      href.match(/\/user\/(\d+)/) || href.match(/profile\.php\?id=(\d+)/);
    if (m) return m[1];
    // vanity: lấy đoạn path cuối — vd https://web.facebook.com/beatkhanhhoa24h?... → 'beatkhanhhoa24h'
    try {
      const u = new URL(href, 'https://www.facebook.com');
      const segs = u.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
      return segs.length ? segs[segs.length - 1] : null;
    } catch {
      return null;
    }
  }

  // Chuẩn hoá số tương tác FB về number. VD: "321"→321, "1,2 N"→1200, "3,4 Tr"→3400000.
  // FB vi: '.' = ngăn nghìn, ',' = thập phân; N = nghìn, Tr = triệu. K/M cho UI tiếng Anh.
  private parseCount(raw: string | null | undefined): number | undefined {
    if (!raw) return undefined;
    const m = raw.trim().match(/([\d.,]+)\s*(K|M|N|TR)?/i);
    if (!m) return undefined;
    const num = parseFloat(m[1].replace(/\./g, '').replace(',', '.'));
    if (isNaN(num)) return undefined;
    const suf = (m[2] || '').toUpperCase();
    if (suf === 'K' || suf === 'N') return Math.round(num * 1_000);
    if (suf === 'M' || suf === 'TR') return Math.round(num * 1_000_000);
    return Math.round(num);
  }

  // ─── TẠM (verify Chunk 2b/2c) — mở browser → getAuthenticatedContext → kiểm c_user → đóng. Xóa ở Chunk 3.
  // Trả true nếu context cuối cùng đã đăng nhập (có c_user). Throw nếu checkpoint/failed.
  async verifyAuth(account: OsintFacebookAccount): Promise<boolean> {
    const browser = await this.launchBrowser();
    try {
      const context = await this.getAuthenticatedContext(browser, account);
      const cookies = await context.cookies();
      return cookies.some((c) => c.name === 'c_user');
    } finally {
      await browser.close(); // kill browser mỗi lần (spec G)
    }
  }

  /**
   * Mở browser HEADED để user TỰ login bằng tay (qua cả checkpoint), rồi bắt session lưu DB.
   * Né auto form-login (bị FB phát hiện → checkpoint). Production: login tay hiếm, reuse session.
   * YÊU CẦU FB_HEADLESS=false (không thì cửa sổ ẩn, không login tay được).
   * Flow: launch headed → goto fb → poll cookie c_user tới khi user login xong → storageState → saveSession.
   * Trả true nếu bắt được session; false nếu hết giờ chờ.
   */
  async captureManualSession(
    account: OsintFacebookAccount,
    timeoutMs = 300_000,
  ): Promise<boolean> {
    const browser = await this.launchBrowser();
    try {
      // Context sạch (KHÔNG truyền storageState) — user sẽ login từ đầu trong cửa sổ này.
      const context = await this.newStealthContext(browser);
      const page = await context.newPage();
      await page.goto('https://www.facebook.com/', {
        waitUntil: 'domcontentloaded',
      });
      this.logger.warn(
        `[${account.label}] 👉 HÃY LOGIN BẰNG TAY trong cửa sổ vừa mở (giải cả checkpoint nếu có). Đang chờ…`,
      );
      // Login thành công → cookie c_user xuất hiện. Poll tới khi có hoặc hết giờ.
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const cookies = await context.cookies();
        if (cookies.some((c) => c.name === 'c_user')) {
          // Chờ thêm để session ổn định (FB set nốt cookie/token) rồi mới export.
          await page.waitForTimeout(5000);
          const state = await context.storageState();
          await this.accountManager.saveSession(
            account.id,
            JSON.stringify(state),
          );
          this.logger.log(`[${account.label}] đã bắt session + lưu DB ✅`);
          return true;
        }
        await page.waitForTimeout(3000);
      }
      this.logger.error(`[${account.label}] hết giờ chờ login tay`);
      return false;
    } finally {
      await browser.close();
    }
  }
  // ─── TẠM (verify Chunk 3a-i) — auth → scrapeGroupPostIds → trả danh sách ID. Xóa ở Chunk 4.
  async verifyScrapeIds(
    account: OsintFacebookAccount,
    entryUrl: string,
  ): Promise<{ externalPostId: string; postUrl: string }[]> {
    const browser = await this.launchBrowser();
    try {
      const context = await this.getAuthenticatedContext(browser, account);
      return await this.scrapeGroupPostIds(context, entryUrl);
    } finally {
      await browser.close();
    }
  }

  // ─── TẠM (verify Chunk 3a-ii) — auth → scrapePostDetail trên 1 post → trả RawPost. Xóa ở Chunk 4.
  async verifyScrapeDetail(
    account: OsintFacebookAccount,
    target: { externalPostId: string; postUrl: string },
  ): Promise<RawPost | null> {
    const browser = await this.launchBrowser();
    try {
      const context = await this.getAuthenticatedContext(browser, account);
      return await this.scrapePostDetail(context, target);
    } finally {
      await browser.close();
    }
  }
}
