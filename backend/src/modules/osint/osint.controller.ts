import { Controller, Get } from '@nestjs/common';
import { OsintService } from './osint.service';

@Controller('osint')
export class OsintController {
  constructor(private readonly osintService: OsintService) {}

  // API lay danh sach cac nguon theo doi
  @Get('sources')
  getSources() {
    return this.osintService.getSources();
  }

  // API lay danh sach cac article moi nhat
  @Get('articles')
  getArticles() {
    return this.osintService.getArticles();
  }

  // API lay danh sach cac canh bao chua duoc xac nhan
  @Get('alerts')
  getAlerts() {
    return this.osintService.getAlerts();
  }

  // API lay danh sach cac tu khoa
  @Get('keywords')
  getKeywords() {
    return this.osintService.getKeywords();
  }
}
