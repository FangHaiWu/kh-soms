import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Ward } from './entities/ward.entity';
import { WardAlias } from './entities/ward-alias.entity';
import { UnmatchedLocation } from './entities/unmatched-location.entity';
import { WardMatcherService } from './services/ward-matcher.service';

// Module địa bàn — S6. Export WardMatcherService cho OsintModule dùng ở worker NLP.
@Module({
  imports: [TypeOrmModule.forFeature([Ward, WardAlias, UnmatchedLocation])],
  providers: [WardMatcherService],
  exports: [TypeOrmModule, WardMatcherService],
})
export class GeographyModule {}
