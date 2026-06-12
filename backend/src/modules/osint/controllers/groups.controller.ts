import {
  Controller,
  Get,
  Put,
  Patch,
  Body,
  Param,
  Query,
  Delete,
  Post,
} from '@nestjs/common';
import { GroupService } from '../services/groups/groups.service';
import { ListGroupsQueryDto } from '../dtos/list-groups-query.dto';
import { OsintGroup } from '../entities/osint-group.entity';
import { UpdateGroupDto } from '../dtos/update-group.dto';
import { CreateGroupDto } from '../dtos/create-group.dto';

@Controller('groups') // prefix: /api/v1/groups
export class GroupsController {
  constructor(private readonly groupService: GroupService) {}

  // GET /api/v1/groups
  @Get()
  findAll(@Query() query: ListGroupsQueryDto): Promise<OsintGroup[]> {
    return this.groupService.findAll(query);
  }

  // GET /api/v1/groups/:id
  @Get(':id')
  findOne(@Param('id') id: string): Promise<OsintGroup> {
    return this.groupService.findOne(id);
  }

  // POST /api/v1/groups
  @Post()
  create(@Body() dto: CreateGroupDto): Promise<OsintGroup> {
    return this.groupService.create(dto);
  }

  // PUT /api/v1/groups/:id
  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateGroupDto,
  ): Promise<OsintGroup> {
    return this.groupService.update(id, dto);
  }

  // PATCH /api/v1/groups/:id/toggle-active — bật/tắt crawl
  @Patch(':id/toggle-active')
  toggleActive(@Param('id') id: string): Promise<OsintGroup> {
    return this.groupService.toggleActive(id);
  }

  // DELETE /api/v1/groups/:id - vô hiệu hóa group (chưa hỗ trợ xóa cứng)
  @Delete(':id')
  remove(@Param('id') id: string): Promise<{ message: string }> {
    return this.groupService.remove(id);
  }
}
