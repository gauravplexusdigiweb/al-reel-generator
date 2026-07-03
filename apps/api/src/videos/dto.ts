import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { ASPECT_RATIOS } from '@arg/shared';

export class CreateReelDto {
  @ApiProperty({ description: 'Clip start (seconds, absolute in source video)' })
  @IsNumber()
  @Min(0)
  startSec!: number;

  @ApiProperty({ description: 'Clip end (seconds, absolute in source video)' })
  @IsNumber()
  @Min(0)
  endSec!: number;

  @ApiPropertyOptional({ description: 'Nominal duration bucket label (seconds)' })
  @IsOptional()
  @IsNumber()
  durationBucket?: number;

  @ApiPropertyOptional({ enum: ASPECT_RATIOS })
  @IsOptional()
  @IsString()
  aspectRatio?: string;
}

export class MoveVideoDto {
  @ApiPropertyOptional({ description: 'Target category ID (null = uncategorized)' })
  @IsOptional()
  @IsString()
  categoryId?: string | null;
}
