import {
  IsUUID,
  IsString,
  IsOptional,
  IsArray,
  IsInt,
  IsNotEmpty,
  Min,
  Max,
  IsObject,
} from 'class-validator';

export class CreateGroupDto {
  @IsUUID()
  platformId: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  url: string;

  @IsOptional()
  @IsString()
  externalGroupId?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  crawlIntervalHours?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  trustLevel?: number;

  @IsOptional()
  @IsObject()
  platformSpecificData?: Record<string, unknown>;
}
