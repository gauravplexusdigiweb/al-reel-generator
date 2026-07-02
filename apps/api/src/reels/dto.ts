import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class TrimReelDto {
  @ApiProperty({ description: 'New start time (seconds, absolute in source video)' })
  @IsNumber()
  @Min(0)
  startSec!: number;

  @ApiProperty({ description: 'New end time (seconds, absolute in source video)' })
  @IsNumber()
  @Min(0)
  endSec!: number;
}

export class RegenerateReelDto {
  @ApiPropertyOptional({ enum: [15, 30, 45, 60], description: 'Target duration bucket (seconds)' })
  @IsOptional()
  @IsIn([15, 30, 45, 60])
  durationBucket?: number;
}

export class SelectThumbnailDto {
  @ApiProperty({ description: 'Thumbnail id to mark as selected' })
  @IsString()
  thumbnailId!: string;
}

export class ReviewNotesDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
