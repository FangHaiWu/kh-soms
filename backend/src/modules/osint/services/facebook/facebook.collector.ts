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
      // 1. Kieerm tra session còn sống: mở fb -> xem có bị đá về /login không + còn c_user không
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
      // Bung tất cả "Xem thêm" để content không bị cắt. Click có thể fail (FB redraw) → catch nuốt.
      for (const btn of await page
        .getByRole('button', { name: 'Xem thêm', exact: true })
        .all()) {
        try {
          await btn.click({ timeout: 1500 });
        } catch {}
      }
      await page.waitForTimeout(500); // chờ text bung
      // postId được TRUYỀN qua arg thứ 2 (closure Node không vào được trình duyệt).
      const detail = await page.evaluate((postId) => {
        // Mọi khối nội dung post trên trang. VD trên group permalink có thể có 2-3 cái.
        const messages = Array.from(
          document.querySelectorAll('div[data-ad-preview="message"]'),
        );
        // ────────── Helper nearestUser: tìm link tác giả GẦN message nhất ──────────
        // Vì sao cần: tác giả post (link /user/<id>) KHÔNG nằm bên trong message — nó ở header
        // của khối post, là "anh em họ" của message. Leo cha 8 cấp không gặp (tác giả ở
        // nhánh khác). → Quét TOÀN document, đo "khoảng cách DOM" tới message, lấy gần nhất.
        //
        // "Khoảng cách DOM" = bậc leo từ msg lên TỔ TIÊN CHUNG GẦN NHẤT (LCA) + bậc xuống từ
        // LCA tới user-link. Càng nhỏ = càng "gần" nhau trong cây DOM.
        // Probe đã verify: tác giả thật "Beat Khánh Hòa" có dist ≈ 16 (gần message),
        // còn 1 commenter "EmeraldLynx8008" có dist ≈ 60 (xa) → cap dist ≤ 25 để loại nhầm.
        const nearestUser = (msgEl: Element) => {
          // BẮT BUỘC quét TOÀN document — tác giả không nằm trong message.
          const links = Array.from(
            document.querySelectorAll('a[href*="/user/"]'),
          ).filter((x) => {
            const h = (x as HTMLAnchorElement).getAttribute('href') || '';
            const t = (x.textContent || '').trim();
            // /user/<số> ở bất kỳ đâu trong href (đừng dùng $ cuối — href thật còn '/' sau).
            return t && /\/user\/\d+/.test(h);
          });
          let best: { href: string; text: string; dist: number } | null = null;
          for (const u of links) {
            // (a) Liệt kê tất cả tổ tiên của message (msg → cha → ông → ...)
            //     VD: [msg, div, div, article, ..., body]
            const ancestors: Element[] = [];
            let cur: Element | null = msgEl;
            while (cur) {
              ancestors.push(cur);
              cur = cur.parentElement;
            }
            // (b) LCA = tổ tiên ĐẦU TIÊN của msg mà CHỨA user-link u.
            //     contains() kiểm "u có nằm trong cây con của tổ tiên đó không".
            //     lcaIdx = số bước cần LEO từ msg lên LCA.
            const lcaIdx = ancestors.findIndex((a) => a.contains(u));
            if (lcaIdx < 0) continue; // u không cùng cây → bỏ qua
            // (c) Đếm bậc XUỐNG từ LCA tới u (leo lên đếm là tương đương).
            let down = 0;
            let p: Element | null = u;
            while (p && p !== ancestors[lcaIdx]) {
              p = p.parentElement;
              down++;
            }
            const dist = lcaIdx + down; // tổng đường đi msg <-> u qua LCA
            // Giữ user có dist nhỏ nhất → tác giả gần message nhất.
            if (!best || dist < best.dist) {
              best = {
                href: (u as HTMLAnchorElement).href,
                text: u.textContent || '',
                dist,
              };
            }
          }
          return best;
        };

        // ────────── BÓC NEO-THEO-ID (chạy TRONG trình duyệt) ──────────

        // Duyệt từng message, kiểm xem nó có thuộc post mục tiêu không.
        for (const msg of messages) {
          let el: Element | null = msg;
          let idMatch = false; // khối có link /posts/<postId> chưa?

          // Leo lên TỐI ĐA 8 đời cha. Leo sâu hơn (vd 25) sẽ chạm tổ tiên dùng chung
          // với post khác → gán nhầm post. 8 đời = khối chặt vừa đủ.
          for (let i = 0; i < 8 && el; i++) {
            el = el.parentElement;
            if (!el) break;

            // (1) Khối này có link /posts/<postId> KHÔNG kèm comment_id?
            //     /posts/1722345968791242   ✅ (link permalink của post)
            //     /posts/1722345968791242?comment_id=999  ❌ (link 1 comment, không phải post)
            //     Phải `some()` vì 1 khối có nhiều <a>, chỉ cần 1 cái khớp là đủ.
            if (
              Array.from(el.querySelectorAll('a[href]')).some((x) => {
                const h = (x as HTMLAnchorElement).href;
                return (
                  h.includes('/posts/' + postId) && !h.includes('comment_id')
                );
              })
            ) {
              idMatch = true;
              break;
            }
          }
          if (!idMatch) continue;

          // (2) Author = /user/<số> GẦN message nhất theo dist DOM (xem helper nearestUser).
          //     Cap dist ≤ 25: probe đo được author thật ~16, commenter ~60 → 25 là ngưỡng an toàn.
          //     Vượt cap → để null thay vì gán nhầm commenter làm tác giả.
          const u = nearestUser(msg);
          const authorOK = u && u.dist <= 25;
          return {
            content: (msg as HTMLElement).innerText,
            authorName: authorOK ? u.text.slice(0, 200) : null,
            authorHref: authorOK ? u.href : null,
          };
        }

        return null;
      }, target.externalPostId);

      // Không tìm thấy post mục tiêu (vd FB ẩn, đã xóa) → bỏ qua.
      if (!detail) return null;

      // ────────── Bóc authorExternalId Ở NODE (sau evaluate) ──────────
      // Tách ID số từ href tác giả. VD:
      //   '/groups/928.../user/61578579235269/'  → match[1] = '61578579235269'  (post trong group)
      //   '/profile.php?id=100012345678'         → match[1] = '100012345678'   (post trên page/profile)
      //   '/khanhhoa.vietnam' (vanity của page) → cả 2 regex trượt → null     (MVP chấp nhận)
      // Đây là field QUAN TRỌNG cho graph đối tượng Phase 3 (node = người).
      let authorExternalId: string | null = null;
      if (detail.authorHref) {
        const m =
          detail.authorHref.match(/\/user\/(\d+)/) ||
          detail.authorHref.match(/profile\.php\?id=(\d+)/);
        authorExternalId = m ? m[1] : null;
      }
      // ────────── Dựng RawPost — đối tượng chuẩn dùng chung cho mọi nguồn ──────────
      // VD kết quả cuối với post "tai nạn Phong Châu":
      // {
      //   externalPostId: '1722345968791242',           // khóa dedup (UNIQUE platform+id)
      //   content:        'GẤP GẤP!! ... cầu Phong Châu (Nha Trang)...',
      //   authorName:     'Beat Khánh Hòa',
      //   authorExternalId: '61578579235269',           // ⭐ node người cho graph Phase 3
      //   platformSpecificData: { postUrl: '...posts/1722345968791242/' },
      // }
      // Sau này PostIngestService nhận object này → NLP → save osint_posts (tái dùng pipeline).
      const rawPost: RawPost = {
        externalPostId: target.externalPostId,
        content: detail.content,
        authorName: detail.authorName,
        authorExternalId,
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
