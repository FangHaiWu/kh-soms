// Boot Nest context de lay service qua DI, goi thu extract 1 url baokhanhhoa
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { NewsExtractorBridgeService } from '../modules/osint/services/news-extractor/news-extractor-brigde.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const brigde = app.get(NewsExtractorBridgeService);

  // 1 Url bai that tren bao khanh hoa.vn (lay 1 link bai bat ky)
  const url =
    'https://baokhanhhoa.vn/xa-hoi/202606/du-an-duong-lien-vung-khanh-son-khanh-vinh-go-vuong-de-tang-toc-thi-cong-da738d4/';
  const result = await brigde.extract(url);

  console.log(`Ket qua:`, JSON.stringify(result, null, 2));
  await app.close(); // Dong Nest context
}
main();
