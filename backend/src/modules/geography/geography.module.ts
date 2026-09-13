import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Ward } from './entities/ward.entity';
import { WardAlias } from './entities/ward-alias.entity';
import { UnmatchedLocation } from './entities/unmatched-location.entity';

// Module địa bàn — S6. Export WardMatcherService cho OsintModule dùng ở worker NLP.
@Module({
  imports: [TypeOrmModule.forFeature([Ward, WardAlias, UnmatchedLocation])],
  providers: [],
  exports: [TypeOrmModule],
})
export class GeographyModule {}
