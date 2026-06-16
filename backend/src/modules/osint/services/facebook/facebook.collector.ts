import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { chromium, Browser, BrowserContext } from 'playwright';
import { FacebookAccountManager } from '@modules/osint/services/facebook/facebook-account-manager.service';
import { OsintFacebookAccount } from '@modules/osint/entities/osint-facebook-account.entity';
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
}
