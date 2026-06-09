import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { NewsCrawlCollector } from '../modules/osint/services/collectors/news-crawl.collector';
async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const collector = app.get(NewsCrawlCollector);
  const result = await collector.collect('https://baokhanhhoa.vn/xa-hoi/');
  console.log('ok:', result.ok, '| Số posts: ', result.posts.length);
  console.log(result.posts[0]?.platformSpecificData);
}
main();
