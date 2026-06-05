import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ArrayContains, Repository } from 'typeorm';
import { OsintGroup } from '../../entities/osint-group.entity';
import { OsintPlatform } from '../../entities/osint-platform.entity';
import { ListGroupsQueryDto } from '../../dtos/list-groups-query.dto';
import { CreateGroupDto } from '../../dtos/create-group.dto';
import { UpdateGroupDto } from '../../dtos/update-group.dto';

@Injectable()
export class GroupService {
  private readonly logger = new Logger(GroupService.name);
  constructor(
    @InjectRepository(OsintGroup)
    private groupRepo: Repository<OsintGroup>,

    @InjectRepository(OsintPlatform)
    private readonly platformRepo: Repository<OsintPlatform>,
  ) {}

  // Lay danh sach nguon tin
  async findAll(query: ListGroupsQueryDto): Promise<OsintGroup[]> {
    this.logger.log('Bắt đầu tìm kiếm nguồn tin');
    const { platform, isActive, tags, page, limit } = query;
    const where: any = {};
    if (platform) where.platform = { name: platform };
    if (isActive !== undefined) where.isActive = isActive;
    if (tags) where.tags = ArrayContains([tags]);
    const groups = await this.groupRepo.find({
      where,
      relations: ['platform'],
      skip: ((page ?? 1) - 1) * (limit ?? 20),
      take: limit ?? 20,
      order: { createdAt: 'DESC' },
    });
    return groups;
  }

  // Tim group theo id
  // Load relation platform de tra ve thong tin platform
  // Throw NotFoundException neu khong tim thay - khong bao gio tra ve null
  async findOne(id: string): Promise<OsintGroup> {
    const group = await this.groupRepo.findOne({
      where: { id },
      relations: ['platform'],
    });
    if (!group) throw new NotFoundException(`Group ${id} không tìm thấy`);
    return group;
  }

  // Tao group moi
  // Validate platformId ton tai trong DB truoc khi tao -> Throw NotFoundException neu khong tim thay
  // Tao entity tu dto -> save vao DB
  async create(dto: CreateGroupDto): Promise<OsintGroup> {
    // 1. Check platform ton tai
    const platform = await this.platformRepo.findOne({
      where: { id: dto.platformId },
    });
    if (!platform)
      throw new NotFoundException(`Platform ${dto.platformId} not found`);
    // 2. Tao entity tu dto
    const group = this.groupRepo.create({ ...dto });

    // 3. Luu vao DB
    return this.groupRepo.save(group);
  }
  // Update group
  // Validate platformId ton tai trong DB truoc khi tao -> Throw NotFoundException neu khong tim thay
  // Update entity tu dto -> save vao DB

  async update(id: string, dto: UpdateGroupDto): Promise<OsintGroup> {
    // 1. Kiem tra group ton tai - tu thow exception neu khong tim thay
    const group = await this.findOne(id);

    // 2. Kiem tra platform ton tai
    if (dto.platformId) {
      const platform = await this.platformRepo.findOne({
        where: { id: dto.platformId },
      });
      if (!platform)
        throw new NotFoundException(`Platform ${dto.platformId} không tồn tại`);
    }

    // 3. Merge dto vao entity (chi ghi de fields co trong dto, giu nguyen phan con lai)
    Object.assign(group, dto);

    // 4. Persit - Typeorm sinh update chi cho cac fields co thay doi
    return this.groupRepo.save(group);
  }

  // toggleActive
  async toggleActive(id: string): Promise<OsintGroup> {
    // 1. Kiem tra group ton tai - tu thow exception neu khong tim thay
    const group = await this.findOne(id);

    // 2. toggle isActive
    group.isActive = !group.isActive;
    return this.groupRepo.save(group);
  }
}
