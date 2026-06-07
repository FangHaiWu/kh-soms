import { Get, Body, Param, Controller, Put } from '@nestjs/common';
import { PlatformService } from '../services/platform/platform.service';
import { UpdatePlatformDto } from '../dtos/update-platform.dto';
import { OsintPlatform } from '../entities/osint-platform.entity';

@Controller('platforms')
export class PlatformController {
  constructor(private readonly platformService: PlatformService) {}

  @Get() // GET /api/v1/platforms
  findAll(): Promise<OsintPlatform[]> {
    return this.platformService.findAll();
  }

  @Get(':id') // GET /api/v1/platforms/:id
  findOne(@Param('id') id: string): Promise<OsintPlatform> {
    return this.platformService.findOne(id);
  }

  @Put(':id') // PUT /api/v1/platforms/:id
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePlatformDto,
  ): Promise<OsintPlatform> {
    return this.platformService.update(id, dto);
  }
}
