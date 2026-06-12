import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OsintPlatform } from '../../entities/osint-platform.entity';
import { UpdatePlatformDto } from '../../dtos/update-platform.dto';

@Injectable()
export class PlatformService {
  private readonly logger = new Logger(PlatformService.name);
  constructor(
    @InjectRepository(OsintPlatform)
    private readonly platformRepo: Repository<OsintPlatform>,
  ) {}

  // Lay tat ca nen tang (ke ca inactive) — dung cho admin dashboard
  async findAll(): Promise<OsintPlatform[]> {
    this.logger.log('findAll: lấy danh sách tất cả platforms');
    return this.platformRepo.find({ order: { name: 'ASC' } });
  }

  // Tim platform theo id — throw neu khong ton tai
  async findOne(id: string): Promise<OsintPlatform> {
    this.logger.log(`findOne: id=${id}`);
    const platform = await this.platformRepo.findOneBy({ id });
    if (!platform) throw new NotFoundException(`Platform ${id} not found`);
    return platform;
  }

  // Cap nhat cau hinh van hanh (isActive, platformSettings, crawlInterval, notes)
  // Khong cho sua name/crawlerType vi anh huong truc tiep den code CrawlerFactory
  async update(id: string, dto: UpdatePlatformDto): Promise<OsintPlatform> {
    this.logger.log(`update: id=${id} fields=${Object.keys(dto).join(',')}`);

    // Load platform — tu throw neu khong ton tai
    const platform = await this.findOne(id);

    // Merge cau hinh moi vao entity
    Object.assign(platform, dto);

    const saved = await this.platformRepo.save(platform);
    this.logger.log(`update: thành công platform="${saved.name}"`);
    return saved;
  }
}
