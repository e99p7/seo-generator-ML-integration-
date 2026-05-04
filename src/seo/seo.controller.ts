import { Body, Controller, Get, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { GenerateSeoDto } from './dto/generate-seo.dto';
import { SeoService } from './seo.service';
import { initSse, sendSse } from './sse';

@Controller('api')
export class SeoController {
  constructor(private readonly seoService: SeoService) {}

  @Get('generate-seo')
  getGenerateSeoHelp() {
    return {
      ok: true,
      message: 'This endpoint accepts POST requests only for generation. Use curl/Postman/frontend with POST and Accept: text/event-stream.',
      method: 'POST',
      path: '/api/generate-seo',
      exampleBody: {
        product_name: 'Кофемашина DeLonghi Magnifica S',
        category: 'Кофемашины',
        keywords: ['кофемашина', 'автоматическая кофемашина', 'DeLonghi'],
      },
    };
  }

  @Post('generate-seo')
  async generateSeo(@Body() dto: GenerateSeoDto, @Res() res: Response): Promise<void> {
    initSse(res);

    const abortController = new AbortController();
    res.on('close', () => abortController.abort());

    try {
      sendSse(res, 'start', { ok: true });

      for await (const event of this.seoService.generate(dto, abortController.signal)) {
        if (event.type === 'token') sendSse(res, 'token', { token: event.token });
        if (event.type === 'metadata') sendSse(res, 'metadata', event.metadata);
        if (event.type === 'result') sendSse(res, 'result', event.result);
        if (event.type === 'done') sendSse(res, 'done', '[DONE]');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      sendSse(res, 'error', { message });
    } finally {
      res.end();
    }
  }
}
