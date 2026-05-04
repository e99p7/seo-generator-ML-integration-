import { ArrayMaxSize, ArrayMinSize, IsArray, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

function normalizeText(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class GenerateSeoDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  @Transform(({ value }) => normalizeText(value))
  product_name!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  @Transform(({ value }) => normalizeText(value))
  category!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    }
    if (Array.isArray(value)) {
      return value.map((item) => String(item).trim()).filter(Boolean);
    }
    return value;
  })
  keywords!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(10)
  @Transform(({ value }) => normalizeText(value))
  language?: string = 'ru';
}
