/* 
  Mục đích: service quản lý vòng đời tài khoản công cụ FB. 
  Đây là nơi EncryptionService (Bước 2) được dùng thật, và là nguồn cấp account cho FacebookCollector (Bước 4). 
  ┌─ create(label, loginId, plainPassword)     → mã hóa password → lưu DB
  ├─ getCredentials(accountId)                  → giải mã password → trả về cho collector login
  ├─ pickAvailable()                            → chọn 1 account khả dụng (rotation)   
  ├─ recordUsage(accountId)                     → crawl_count_today++ , last_used_at = now
  ├─ markCheckpoint(accountId)                  → checkpoint_count++ ; ≥3 → retire, else → checkpoint
  └─ resetDailyCounts()                         → crawl_count_today = 0 (cron 0h, làm sau)
*/

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { OsintFacebookAccount } from '@modules/osint/entities/osint-facebook-account.entity';
import { EncryptionService } from '@common/crypto/encryption.service';
import { ConfigService } from '@nestjs/config';
import { AlertService } from '@modules/osint/services/alert/alert.service';

@Injectable()
export class FacebookAccountManager {
  // Thêm maxCrawlPerDay và maxCheckpoints
  private readonly maxCrawlPerDay: number;
  private readonly maxCheckpoints: number;
  constructor(
    @InjectRepository(OsintFacebookAccount)
    private readonly accountRepo: Repository<OsintFacebookAccount>,
    private readonly encryptionService: EncryptionService,
    private readonly configService: ConfigService,
    private readonly alertService: AlertService,
  ) {
    this.maxCrawlPerDay = Number(
      this.configService.get('FB_MAX_CRAWLS_PER_DAY', 5),
    );
    this.maxCheckpoints = Number(
      this.configService.get('FB_MAX_CHECKPOINTS', 3),
    );
  }
  // Chunk 1
  // Tạo account mới: Nhận password dạng thường -> mã hóa trước khi lưu
  // Flow: tạo entity (encrypt password) -> save -> trả về (không kèm plaintext)
  async create(
    label: string,
    loginIdentifier: string,
    plainPassword: string,
  ): Promise<OsintFacebookAccount> {
    // 1. Mã hóa password NGAY, không bao giờ lưu trên plaintext xuống DB
    const encryptedPassword = this.encryptionService.encrypt(plainPassword);
    // 2. Tạo instance (status mặc định 'active') từ default cột)
    const account = this.accountRepo.create({
      label,
      loginIdentifier,
      encryptedPassword: encryptedPassword,
    });
    // 3. Persist -> TypeORM tự gán id + timestamps
    return this.accountRepo.save(account);
  }

  // Lấy credential để collector đem login: giải mã password
  // Trả plaintesxt -> chỉ gọi sát lúc login, không LOG ra ngoài
  async getCredentials(
    accountId: string,
  ): Promise<{ loginIdentifier: string; password: string }> {
    // 1. Load account (throw nếu không có -> Tránh decrypt undefined)
    const account = await this.accountRepo.findOneBy({ id: accountId });
    if (!account)
      throw new NotFoundException(`Tài khoản ${accountId} không tồn tại`);

    // 2. Giải mật password
    const password = this.encryptionService.decrypt(account.encryptedPassword);
    return { loginIdentifier: account.loginIdentifier, password };
  }
  // Chunk 2: pick Account available + record usage + markCheckpoint
  // Chọn 1 account 'active' chưa hết quota ngày, ưu tiên dùng ít nhất.
  // Trả null nếu hết account -> caller xử lý fallback (Không throw, vì hết acct là trạng thái hợp lệ)
  async pickAvailable(): Promise<OsintFacebookAccount | null> {
    return this.accountRepo.findOne({
      where: {
        status: 'active',
        crawlCountToday: LessThan(this.maxCrawlPerDay), // <- quota
      },
      order: {
        crawlCountToday: 'ASC', // <- acct dùng ít nhất lên trước
      },
    });
  }

  // Tăng đếm + cập nhật last_used_at. Dùng increment() để ATOMIC (tránh race khi nhiều job)
  async recordUsage(accountId: string): Promise<void> {
    // increment: SET crawl_count_today = crawl_count_today + 1 ngày trong DB (an toàn concurrency)
    await this.accountRepo.increment({ id: accountId }, 'crawlCountToday', 1);
    await this.accountRepo.update(accountId, { lastUsedAt: new Date() });
  }

  // Tăng đếm checkpoint : Nếu đạt ngưỡng -> retire vĩnh viễn, chưa thì -> checkpoint (cooldown)
  async markCheckpoint(accountId: string): Promise<void> {
    // 1. Load để biết count hiện tại
    const account = await this.accountRepo.findOneBy({ id: accountId });
    if (!account)
      throw new NotFoundException(`Tài khoản ${accountId} không tồn tại`);

    // 2. Tính count mới + quyết định status
    const newCount = account.checkpointCount + 1;
    const newStatus =
      newCount >= this.maxCheckpoints ? 'retired' : 'checkpoint';

    // 3. Update
    await this.accountRepo.update(
      { id: accountId },
      {
        checkpointCount: newCount,
        status: newStatus,
        lastCheckpointedAt: new Date(),
      },
    );

    // Báo Admin nếu acct rơi checkpoint (session chết) -> cần capture:fb-session thủ công
    await this.alertService.createSystemAlert({
      alertType:
        newStatus === 'retired'
          ? 'fb_account_retired'
          : 'fb_account_checkpoint',
      severity: newStatus === 'retired' ? 'critical' : 'warning',
      title:
        newStatus === 'retired'
          ? `Tài khoản FB ${account.label} đã retire (đủ ${this.maxCheckpoints} checkpoint)`
          : `Tài khoản FB ${account.label} dính checkpoint ${newCount}/${this.maxCheckpoints} lần`,
      description:
        newStatus === 'retired'
          ? `Acct đã retire vĩnh viễn — thêm acct công cụ mới vào pool`
          : `Acct tự chuyển checkpoint do session hết hạn. Chạy: FB_TEST_LABEL=${account.label} npm run capture:fb-session`,
      sourceRefIds: [account.id],
    });
  }
  // Relogin khi session het han giua vong crawl
  async markNeedsRelogin(accountId: string): Promise<void> {
    const account = await this.accountRepo.findOneBy({ id: accountId });
    if (!account)
      throw new NotFoundException(`Tài khoản ${accountId} không tồn tại`);
    await this.accountRepo.update(
      { id: accountId },
      { status: 'checkpoint', lastCheckpointedAt: new Date() },
    );

    // Báo Admin: acct rơi checkpoint (session chết) -> cần capture:fb-session thủ công
    await this.alertService.createSystemAlert({
      alertType: 'fb_account_needs_relogin',
      severity: 'warning',
      title: `Tài khoản FB ${account.label} cần login lại (session hết hạn)`,
      description: `Acct tự chuyển checkpoint do session hết hạn. Chạy: FB_TEST_LABEL=${account.label} npm run capture:fb-session`,
      sourceRefIds: [account.id],
    });
  }
  // Sử dụng session để đăng nhập
  // Bước ① — Thêm saveSession + getSession vào FacebookAccountManager (manager đã có accountRepo + encryptionService)
  // Lưu session: Nhận storageState JSON -> mã hóa AES-256 -> lưu encrypted_session
  // Session = credential (chứa cookie đăng nhập) -> bắt buộc mã hóa như password
  async saveSession(
    accountId: string,
    storageStateJson: string,
  ): Promise<void> {
    // 1. encrypt ngay
    const encryptedSession = this.encryptionService.encrypt(storageStateJson);
    // 2. Lưu với accountId
    const account = await this.accountRepo.findOneBy({ id: accountId });
    if (!account)
      throw new NotFoundException(`Tài khoản ${accountId} không tồn tại`);
    await this.accountRepo.update(accountId, { encryptedSession });
  }

  // Lấy session đã lưu -> giải mã -> trả JSON string hoặc null nếu chưa có (caller fallback sang login)
  async getSession(accountId: string): Promise<string | null> {
    // 1. Tìm account bằng findOneBy
    const account = await this.accountRepo.findOneBy({ id: accountId });
    if (!account)
      throw new NotFoundException(`Tài khoản ${accountId} không tồn tại`);
    // 2. Giải mật
    // Kiểm tra xem account có encrypted_session chưa
    if (!account.encryptedSession) return null;
    return this.encryptionService.decrypt(account.encryptedSession);
  }
}
