import {
  IsString,
  IsBoolean,
  IsOptional,
  IsInt,
  IsIn,
  Min,
  Max,
} from 'class-validator';
import { Transform } from 'class-transformer';

import {
  PLATFORM_NAMES,
  type PlatformName,
} from '../constants/platform.constants';
export class ListGroupsQueryDto {
  @IsOptional()
  @IsIn(PLATFORM_NAMES)
  platform?: PlatformName;

  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  tags?: string; // tags duoc truyen vao dang chuoi, cac tag cach nhau boi dau phay

  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
