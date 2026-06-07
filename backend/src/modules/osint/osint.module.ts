import { Module } from '@nestjs/common';
import { OsintService } from './osint.service';
import { OsintController } from './osint.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { OsintSource } from './entities/osint-source.entity';
import { OsintAlert } from './entities/osint-alert.entity';
import { OsintArticle } from './entities/osint-article.entity';
import { OsintKeyword } from './entities/osint-keyword.entity';
import { OsintSlangDictionary } from './entities/osint-slang-dictionary.entity';
import { OsintPlatform } from './entities/osint-platform.entity';
import { OsintGroup } from './entities/osint-group.entity';
import { OsintPost } from './entities/osint-post.entity';
import { OsintComment } from './entities/osint-comment.entity';
import { OsintCrawlLog } from './entities/osint-crawl-log.entity';
import { OsintPostNlp } from './entities/osint-post-nlp.entity';
import { CrawlerService } from './services/crawler/crawler.service';
import { NlpService } from './services/nlp/nlp.service';
import { SlangDictionaryService } from './services/slang-dictionary.service';
import { AlertService } from './services/alert/alert.service';
import { CrawlerProcessor } from './services/crawler/crawler.processor';
import { OsintSchedulerService } from './scheduler/osint-scheduler.service';
import { PlatformService } from './services/platform/platform.service';
import { GroupService } from './services/groups/groups.service';
import { PlatformController } from './controllers/platform.controller';
import { GroupsController } from './controllers/groups.controller';
@Module({
  imports: [
    TypeOrmModule.forFeature([
      OsintAlert,
      OsintArticle,
      OsintSource,
      OsintKeyword,
      OsintSlangDictionary,
      OsintPlatform,
      OsintGroup,
      OsintPost,
      OsintComment,
      OsintCrawlLog,
      OsintPostNlp,
    ]),
    BullModule.registerQueue({ name: 'osint-crawl' }),
  ],

  // TypeOrmModule.forFeature([...]) -> Tao ra cac Repository cho moi Entity va dua vao DI container cuar module
  providers: [
    OsintService,
    CrawlerService,
    NlpService,
    SlangDictionaryService,
    AlertService,
    CrawlerProcessor,
    OsintSchedulerService,
    PlatformService,
    GroupService,
  ],
  controllers: [OsintController, PlatformController, GroupsController],
  exports: [TypeOrmModule],
})
export class OsintModule {}
