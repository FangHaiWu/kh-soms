import {
  IsString,
  IsBoolean,
  IsOptional,
  IsObject,
  Min,
  IsInt,
} from 'class-validator';

export class UpdatePlatformDto {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsObject()
  platformSettings?: Record<string, any>;

  @IsOptional()
  @IsInt()
  @Min(1)
  crawlIntervalMinutesDefault?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
