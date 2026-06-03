import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { OsintService } from './osint.service';
import { OsintArticle } from './entities/osint-article.entity';
import { OsintSource } from './entities/osint-source.entity';
import { OsintAlert } from './entities/osint-alert.entity';
import { OsintKeyword } from './entities/osint-keyword.entity';

describe('OsintService', () => {
  let service: OsintService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OsintService,
        { provide: getRepositoryToken(OsintArticle), useValue: {} },
        { provide: getRepositoryToken(OsintSource), useValue: {} },
        { provide: getRepositoryToken(OsintAlert), useValue: {} },
        { provide: getRepositoryToken(OsintKeyword), useValue: {} },
      ],
    }).compile();

    service = module.get<OsintService>(OsintService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
