import { Test, TestingModule } from '@nestjs/testing';
import { OsintController } from './osint.controller';
import { OsintService } from './osint.service';

describe('OsintController', () => {
  let controller: OsintController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OsintController],
      providers: [{ provide: OsintService, useValue: {} }],
    }).compile();

    controller = module.get<OsintController>(OsintController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
