import { Module } from '@nestjs/common';
import { SeoModule } from './seo/seo.module';

@Module({
  imports: [SeoModule],
})
export class AppModule {}
