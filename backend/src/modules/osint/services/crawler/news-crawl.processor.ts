import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OsintSource } from '../../entities/osint-source.entity';
import { OsintPlatform } from '../../entities/osint-platform.entity';
import { PostIngestService } from '../ingest/post-ingest.service';
import { NewsCrawlCollector } from '../collectors/news-crawl.collector';

/**
 * NewsCrawlProcessor — worker nền xử lý 1 job = 1 nguồn.
 *
 * Tách riêng khỏi CrawlerProcessor (RSS) để 1 nguồn báo lỗi/treo KHÔNG ảnh hưởng
 * luồng RSS. Cùng dùng queue 'osint-crawl' nhưng job name khác ('crawl-news-source'),
 * nên @nestjs/bull tự định tuyến đúng handler.
 */

@Processor('osint-crawl')
export class NewsCrawlProcessor {
  private readonly logger = new Logger(NewsCrawlProcessor.name);
  constructor(
    @InjectRepository(OsintSource)
    private sourceRepo: Repository<OsintSource>,
    @InjectRepository(OsintPlatform)
    private platformRepo: Repository<OsintPlatform>,
    private ingest: PostIngestService,
    private collector: NewsCrawlCollector,
  ) {}

  /*
   * Crawl 1 URL roi nap vao osint_posts
   * Load source -> Guard type -> Lay Platform -> Crawl -> Nap osint_posts -> cap nhat last_crawled_at -> logger summary
 
    // 3. Lấy platform 'web_news' để có platformId + crawlerType
    //    TODO: platformRepo.findOne({ where: { name: 'web_news' } }); guard null

    // 4. Crawl: collector.collect(source.url) — url = trang chuyên mục
    //    TODO: if (!result.ok) { logger.error(result.error); return; }

    // 5. Nạp osint_posts (KHÔNG groupId, createAlerts mặc định true)
    //    TODO: ingest.ingest(result.posts, { platformId, crawlType })

    // 6. source.lastCrawledAt = new Date(); save
    //    TODO

    // 7. logger.log summary; return summary
   */
  @Process('crawl-news-source')
  async handleCrawlNewsSource(job: Job<{ sourceId: string }>) {
    const { sourceId } = job.data;
    // 1. Load source; bỏ qua nếu không tồn tại / đã tắt
    const source = await this.sourceRepo.findOne({ where: { id: sourceId } });
    if (!source) {
      this.logger.warn(`Nguồn tin với id ${sourceId} không tồn tại`);
      return;
    }
    if (!source.isActive) {
      this.logger.warn(`Nguồn tin với id ${sourceId} đang tắt`);
      return;
    }

    // 2. Guard type: chi xử nguồn web_scrape (phòng job lạc vào nguồn RSS)
    //    TODO: findOne theo id; guard !source và !source.isActive (return + warn)

    // Nguồn có feed thì thuộc RSS processor, không phải news scrape → bỏ
    if (source.rssFeedUrl) {
      this.logger.warn(
        `Nguồn ${source.name} có RSS feed — không thuộc news scrape, bỏ qua`,
      );
      return;
    }
    // 3. Lấy platform 'web_news' để có platformId + crawlerType
    //TODO: platformRepo.findOne({ where: { name: 'web_news' } }); guard null
    const platform = await this.platformRepo.findOne({
      where: { name: 'web_news' },
    });
    if (!platform) {
      this.logger.warn(`Platform không tồn tại - bỏ qua`);
      return;
    }
    // 4. Crawl: collector.collect(source.url) — url = trang chuyên mục
    //    TODO: if (!result.ok) { logger.error(result.error); return; }
    const result = await this.collector.collect(
      source.url,
      source.discoveryConfig,
    );
    if (!result.ok) {
      this.logger.error(`Crawl ${source.url} lỗi: ${result.error}`);
      return;
    }

    // 5. Nạp osint_posts (KHÔNG groupId, createAlerts mặc định true)
    //    TODO: ingest.ingest(result.posts, { platformId, crawlType })
    const summary = await this.ingest.ingest(result.posts, {
      platformId: platform.id,
      crawlType: platform.crawlerType,
    });

    // 6. source.lastCrawledAt = new Date(); save
    //    TODO
    source.lastCrawledAt = new Date();
    await this.sourceRepo.save(source);

    // 7. logger.log summary; return summary
    this.logger.log(
      `[${source.name}] +${summary.collected} bài mới, ` +
        `${summary.skipped} trùng, ${summary.alertsCreated} alert`,
    );
    return summary; // trả về cho Bull lưu kết quả job
  }
}

/* 
Diễn giải từng chặng
① Scheduler đẩy job (mỗi 20 phút)
scheduleNewsCrawl() chạy → query osint_sources lấy nguồn isActive=true AND rss_feed_url IS NULL → tìm thấy dòng baokhanhhoa.vn → đẩy 1 job crawl-news-source { sourceId } vào queue osint-crawl. Xong, không chờ — việc nặng để worker lo.

② Bull định tuyến → Processor nhận
Worker rảnh lấy job, thấy tên crawl-news-source → gọi NewsCrawlProcessor.handleCrawlNewsSource(job).

③ Processor kiểm tra điều kiện (guard)
load source theo sourceId
 ├─ không tồn tại / isActive=false  → warn + return (dừng)
 ├─ có rssFeedUrl                    → warn + return (nguồn này thuộc RSS, không scrape)
 └─ load platform 'web_news'
       └─ không có                   → warn + return
Qua hết guard → có source.url (= /xa-hoi/) + platform (id + crawlerType web_trafilatura).

④ Gọi Collector
collector.collect(source.url). Bên trong collector:

4a. Tải trang chuyên mục — axios.get('/xa-hoi/') kèm User-Agent trung lập → nhận HTML thô.

4b. Discovery — extractArticleUrls(html): cheerio chọn a.title2, lọc regex /20\d{4}/, new URL → tuyệt đối, Set dedup → ra ~19 URL bài.

4c. Giới hạn — slice(0, 10) → lấy 10 URL.

4d. Vòng lặp bóc từng bài (đây là chỗ tốn thời gian ~10s):

cho mỗi URL trong 10 URL:
   bridge.extract(url)                    ← gọi HTTP sang Python
      └─ Python trafilatura.fetch_url + extract → JSON {title, text, author, date}
      └─ Python trả 200 → bridge trả ExtractedArticle
         (nếu 422/502/500 → bridge trả null)
   article null?  → skip (bài hỏng, bỏ qua)
   article ok?    → toRawPost(article) → đẩy vào mảng posts
   await sleep(1000)                      ← rate limit ≤1 req/s (luật OSINT)
4e. Trả về — CollectorResult { sourceLabel:'baokhanhhoa.vn', posts:[~10 RawPost], ok:true }.

⑤ Processor kiểm kết quả
if (!result.ok) → log lỗi + return. Ở đây ok:true → đi tiếp.

⑥ Nạp vào pipeline chung — ingest.ingest(posts, { platformId, crawlType })
Bên trong PostIngestService, mỗi RawPost đi qua 6 bước:

1. Dedup    — đã có post cùng (platformId + externalPostId=URL)? → skip
2. NLP      — phân tích nội dung (keyword ANTT, sentiment...)
3. Slang    — chuẩn hoá tiếng lóng
4. Risk     — tính điểm rủi ro
5. Save     — INSERT vào osint_posts
6. Alert    — nếu liên quan → tạo cảnh báo (createAlerts mặc định true cho news)
Cuối cùng ghi crawl_log (denormalize crawlType='web_trafilatura') + trả IngestSummary { collected, skipped, relevant, alertsCreated }.

⑦ Processor chốt sổ
source.lastCrawledAt = now → save   (đánh dấu để health-check & lần crawl sau)
logger.log("[Báo Khánh Hòa] +N bài mới, M trùng, K alert")
return summary                        (Bull lưu kết quả job)
Điểm cần nhớ về luồng
Bất đồng bộ 2 tầng: cron chỉ đẩy job rồi thoát; toàn bộ việc nặng (HTTP + parse + NLP) chạy nền trong worker → không chặn hệ thống chính.
Cô lập lỗi: 1 bài hỏng → null → skip, không làm sập cả mẻ. 1 nguồn lỗi → job đó fail, nguồn khác không ảnh hưởng.
2 lần "lấy mạng": lần 1 = collector tải trang chuyên mục (discovery); lần 2..11 = Python tải từng bài (extract). Mỗi lần Python fetch_url cũng là 1 hit vào baokhanhhoa → đó là lý do sleep(1000) giữa các bài.
Hợp nhất: news, RSS, Telegram đều đổ về cùng osint_posts qua cùng PostIngestService → NLP/báo cáo phía sau không cần biết bài đến từ nguồn nào.
Dedup theo URL: chạy lại job nhiều lần không nhân đôi — bài cũ bị skip ở bước 1.
 */
