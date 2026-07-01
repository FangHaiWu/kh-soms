import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { FacebookCrawlProcessor } from '@modules/osint/services/crawler/facebook-crawl.processor';
import { Job } from 'bull';

// (1) Bootstrap Nest context - Không mở HTTP server, chỉ dựng DI container
// để lấy ra processor THẬT với mọi dependency (collector, accountManager, ingest, repo) đã được inject sẵn - y như lúc chạy app
async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  try {
    // (2) Lấy ra processor tu container
    const processor = app.get(FacebookCrawlProcessor);

    // (3) GroupId: lay tu env cho tien doi, hoac query group Fb active dau tien (Mac dinh test: Hong bien Khanh Hoa)
    const groupId =
      process.env.FB_GROUP_ID ?? '1803dc20-0c50-4a0e-ae6c-265276acac2f';

    // (4) Gia mot JOB toi gian. Method chi doc job.data nen chi can data: {{...}}
    // Cast "as Job<...>" de TS chap nhan (ta khong dung field khac cuar Job)
    const fakeJob = {
      data: { groupId },
    } as Job<{ groupId: string }>;

    // (5) Goi thang - Day chinh la dieu Bull lam khi nhat job, o day ta test nen chay tay
    const summary = await processor.handleCrawlFacebookGroup(fakeJob);

    // In summary (collected/skipped/alertsCreated) de biet ghi DB ra
    console.log('summary: ', summary);
  } finally {
    await app.close(); // Dong Nest context du thanh cong hay loi
  }
}

main().catch((err) => {
  console.error(err);
  // exit(1) de terminal/CI bao FAIL — script DoD phai phan anh dung loi, khong nuot
  process.exit(1);
});
  