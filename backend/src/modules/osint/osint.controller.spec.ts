import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bull';
import { OsintController } from './osint.controller';
import { OsintService } from './osint.service';
import { OsintPost } from './entities/osint-post.entity';
import { OsintPostNlp } from './entities/osint-post-nlp.entity';

describe('OsintController', () => {
  let controller: OsintController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OsintController],
      providers: [
        { provide: OsintService, useValue: {} },
        { provide: getRepositoryToken(OsintPost), useValue: {} },
        { provide: getRepositoryToken(OsintPostNlp), useValue: {} },
        { provide: getQueueToken('osint-nlp'), useValue: {} },
      ],
    }).compile();

    controller = module.get<OsintController>(OsintController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
