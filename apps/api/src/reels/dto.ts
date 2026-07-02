import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

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

  @ApiPropertyOptional({ enum: ['9:16', '1:1', '4:5'], description: 'Target aspect ratio' })
  @IsOptional()
  @IsIn(['9:16', '1:1', '4:5'])
  aspectRatio?: string;
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

export class TranscriptSegmentDto {
  @ApiProperty()
  @IsNumber()
  @Min(0)
  start!: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  end!: number;

  @ApiProperty()
  @IsString()
  text!: string;
}

export class UpdateReelDto {
  @ApiPropertyOptional({ description: 'Edited reel title' })
  @IsOptional()
  @IsString()
  suggestedTitle?: string;

  @ApiPropertyOptional({ type: [String], description: 'Replacement tag list' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({
    type: [TranscriptSegmentDto],
    description: 'Edited caption segments (offset to reel start). Triggers a re-render.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TranscriptSegmentDto)
  transcript?: TranscriptSegmentDto[];
}
