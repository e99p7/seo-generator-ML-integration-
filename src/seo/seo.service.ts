import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { GenerateSeoDto } from './dto/generate-seo.dto';
import { parseFlowiseSseStream } from './flowise-stream.parser';
import { EmptyLlmResponseError, extractFirstJsonObject, InvalidJsonError } from './json-utils';
import { SeoOutput, SeoOutputSchema } from './seo.schema';

export type SeoStreamEvent =
  | { type: 'token'; token: string }
  | { type: 'metadata'; metadata: unknown }
  | { type: 'result'; result: SeoOutput }
  | { type: 'done' };

type Provider = 'ollama' | 'flowise' | 'mock';

@Injectable()
export class SeoService {
  async *generate(dto: GenerateSeoDto, signal?: AbortSignal): AsyncGenerator<SeoStreamEvent> {
    const provider = this.getProvider();

    yield {
      type: 'metadata',
      metadata: {
        provider,
        fallback_enabled: this.isRuleFallbackEnabled(),
      },
    };

    if (provider === 'mock') {
      const result = makeRuleBasedSeo(dto);
      yield { type: 'token', token: JSON.stringify(result) };
      yield { type: 'result', result };
      yield { type: 'done' };
      return;
    }

    try {
      if (provider === 'flowise') {
        yield* this.generateViaFlowise(dto, signal);
        return;
      }

      yield* this.generateViaOllama(dto, signal);
    } catch (error) {
      if (!this.isRuleFallbackEnabled()) throw error;

      yield {
        type: 'metadata',
        metadata: {
          warning: 'LLM call failed, returned rule-based fallback JSON instead',
          cause: error instanceof Error ? error.message : String(error),
        },
      };

      const result = makeRuleBasedSeo(dto);
      yield { type: 'result', result };
      yield { type: 'done' };
    }
  }

  private async *generateViaOllama(dto: GenerateSeoDto, signal?: AbortSignal): AsyncGenerator<SeoStreamEvent> {
    const timeoutMs = Number(process.env.LLM_TIMEOUT_MS ?? process.env.OLLAMA_TIMEOUT_MS ?? 300_000);
    const timeoutController = new AbortController();
    const timeout = setTimeout(() => timeoutController.abort(), timeoutMs);
    const compositeSignal = anySignal([signal, timeoutController.signal].filter(Boolean) as AbortSignal[]);

    try {
      const response = await fetch(this.getOllamaUrl('/api/chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.buildOllamaPayload(dto)),
        signal: compositeSignal,
      });

      if (!response.ok) {
        const body = await safeReadText(response);
        throw new Error(`Ollama request failed: ${response.status} ${body}`);
      }

      if (!response.body) throw new Error('Ollama response has no stream body');

      let accumulated = '';
      for await (const token of parseOllamaNdjson(response.body)) {
        if (!token) continue;
        accumulated += token;
        yield { type: 'token', token };
      }

      const result = this.parseAndValidateSeoJson(accumulated);
      yield { type: 'result', result };
      yield { type: 'done' };
    } catch (error) {
      if (isAbortError(error) || timeoutController.signal.aborted) {
        throw new Error(`Ollama timeout after ${timeoutMs} ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async *generateViaFlowise(dto: GenerateSeoDto, signal?: AbortSignal): AsyncGenerator<SeoStreamEvent> {
    const timeoutMs = Number(process.env.LLM_TIMEOUT_MS ?? process.env.FLOWISE_TIMEOUT_MS ?? 120_000);
    const timeoutController = new AbortController();
    const timeout = setTimeout(() => timeoutController.abort(), timeoutMs);
    const compositeSignal = anySignal([signal, timeoutController.signal].filter(Boolean) as AbortSignal[]);

    try {
      const response = await fetch(this.getFlowiseUrl(), {
        method: 'POST',
        headers: this.getFlowiseHeaders(),
        body: JSON.stringify(this.buildFlowisePayload(dto)),
        signal: compositeSignal,
      });

      if (!response.ok) {
        const body = await safeReadText(response);
        throw new Error(`Flowise request failed: ${response.status} ${body}`);
      }

      if (!response.body) throw new Error('Flowise response has no stream body');

      let accumulated = '';
      for await (const chunk of parseFlowiseSseStream(response.body)) {
        if (chunk.metadata) {
          yield { type: 'metadata', metadata: chunk.metadata };
          continue;
        }
        if (!chunk.token) continue;

        accumulated += chunk.token;
        yield { type: 'token', token: chunk.token };
      }

      const result = this.parseAndValidateSeoJson(accumulated);
      yield { type: 'result', result };
      yield { type: 'done' };
    } catch (error) {
      if (isAbortError(error) || timeoutController.signal.aborted) {
        throw new Error(`Flowise timeout after ${timeoutMs} ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private parseAndValidateSeoJson(raw: string): SeoOutput {
    try {
      const parsed = extractFirstJsonObject(raw);
      return SeoOutputSchema.parse(parsed);
    } catch (error) {
      if (error instanceof EmptyLlmResponseError || error instanceof InvalidJsonError) throw error;

      if (error instanceof z.ZodError) {
        throw new Error(`Invalid SEO JSON schema: ${error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ')}`);
      }

      throw error;
    }
  }

  private getProvider(): Provider {
    const value = (process.env.LLM_PROVIDER ?? 'ollama').trim().toLowerCase();
    if (value === 'flowise') return 'flowise';
    if (value === 'mock' || value === 'rule' || value === 'local-rule') return 'mock';
    return 'ollama';
  }

  private isRuleFallbackEnabled(): boolean {
    return (process.env.ENABLE_RULE_FALLBACK ?? 'true').toLowerCase() !== 'false';
  }

  private getOllamaUrl(path: string): string {
    const baseUrl = (process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434').replace(/\/$/, '');
    return `${baseUrl}${path}`;
  }

  private buildOllamaPayload(dto: GenerateSeoDto): Record<string, unknown> {
    return {
      model: process.env.OLLAMA_MODEL ?? 'qwen2.5:3b',
      stream: true,
      options: {
        temperature: Number(process.env.LLM_TEMPERATURE ?? 0.1),
        num_predict: Number(process.env.OLLAMA_NUM_PREDICT ?? 900),
      },
      messages: [
        {
          role: 'system',
          content:
            'Ты SEO-копирайтер для интернет-магазина. Отвечай только валидным JSON без markdown, комментариев и текста вокруг JSON.',
        },
        {
          role: 'user',
          content: buildSeoPrompt(dto),
        },
      ],
    };
  }

  private getFlowiseUrl(): string {
    const baseUrl = process.env.FLOWISE_BASE_URL?.replace(/\/$/, '');
    const chatflowId = process.env.FLOWISE_CHATFLOW_ID;

    if (!baseUrl) throw new Error('FLOWISE_BASE_URL is required. Example: http://localhost:3000');
    if (!chatflowId?.trim()) {
      throw new Error('FLOWISE_CHATFLOW_ID is not set. Use LLM_PROVIDER=ollama for ready local mode, or paste the real Flowise chatflow ID.');
    }
    if (isPlaceholderChatflowId(chatflowId)) {
      throw new Error('FLOWISE_CHATFLOW_ID contains a sample value, not a real Flowise ID.');
    }

    return `${baseUrl}/api/v1/prediction/${chatflowId.trim()}`;
  }

  private getFlowiseHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream, application/json',
    };

    const apiKey = process.env.FLOWISE_API_KEY?.trim();
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    return headers;
  }

  private buildFlowisePayload(dto: GenerateSeoDto): Record<string, unknown> {
    const keywords = normalizeKeywords(dto);

    return {
      question: buildSeoPrompt(dto),
      streaming: true,
      overrideConfig: {
        promptValues: {
          product_name: dto.product_name,
          category: dto.category,
          keywords,
        },
      },
    };
  }
}

function buildSeoPrompt(dto: GenerateSeoDto): string {
  return `Сгенерируй SEO-описание товара на русском языке.

Входные данные:
- Название товара: ${dto.product_name}
- Категория: ${dto.category}
- SEO-ключи: ${normalizeKeywords(dto)}

Требования:
- Не выдумывай технических характеристик, которых нет во входных данных.
- Ключевые слова используй естественно, без переспама.
- title: до 60 символов.
- meta_description: 120-160 символов.
- h1: должен содержать название товара.
- description: 2-4 абзаца.
- bullets: 4-6 кратких преимуществ.

Верни строго JSON такого вида:
{
  "title": "string",
  "meta_description": "string",
  "h1": "string",
  "description": "string",
  "bullets": ["string"]
}`;
}

function normalizeKeywords(dto: GenerateSeoDto): string {
  return dto.keywords.map((item) => item.trim()).filter(Boolean).join(', ');
}

function makeRuleBasedSeo(dto: GenerateSeoDto): SeoOutput {
  const product = dto.product_name.trim();
  const category = dto.category.trim();
  const keywords = dto.keywords.map((item) => item.trim()).filter(Boolean);
  const mainKeyword = keywords[0] ?? category;

  const result = {
    title: `${product} — купить в категории ${category}`.slice(0, 90),
    meta_description: `${product}: ${mainKeyword} для выбора в категории ${category}. Подходит для карточки товара, SEO-описания и каталога интернет-магазина.`.slice(0, 220),
    h1: `${product}`,
    description:
      `${product} — товар из категории «${category}». Описание подготовлено с учётом ключевых запросов: ${keywords.join(', ')}. ` +
      `Текст можно использовать как базу для карточки товара: он сохраняет естественное вхождение ключевых слов, не перегружает страницу повторениями и помогает пользователю быстро понять назначение товара. ` +
      `Перед публикацией добавьте конкретные характеристики, цену, условия доставки и гарантию, если они доступны в вашей CMS.`,
    bullets: [
      `Естественное использование ключа «${mainKeyword}»`,
      'Подходит для карточки товара и каталога',
      'Без переспама и лишнего markdown',
      'Структура готова для SEO-разметки страницы',
    ],
  };

  return SeoOutputSchema.parse(result);
}

async function* parseOllamaNdjson(stream: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const token = parseOllamaLine(line);
      if (token !== undefined) yield token;
    }
  }

  buffer += decoder.decode();
  if (buffer.trim()) {
    const token = parseOllamaLine(buffer);
    if (token !== undefined) yield token;
  }
}

function parseOllamaLine(line: string): string | undefined {
  const trimmed = line.trim();
  if (!trimmed) return undefined;

  const json = JSON.parse(trimmed) as {
    message?: { content?: string };
    response?: string;
    done?: boolean;
    error?: string;
  };

  if (json.error) throw new Error(`Ollama error: ${json.error}`);
  if (json.message?.content !== undefined) return json.message.content;
  if (json.response !== undefined) return json.response;
  return undefined;
}

async function safeReadText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.message.toLowerCase().includes('abort'));
}

function anySignal(signals: AbortSignal[]): AbortSignal | undefined {
  if (!signals.length) return undefined;
  const controller = new AbortController();

  const abort = () => controller.abort();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort();
      break;
    }
    signal.addEventListener('abort', abort, { once: true });
  }

  return controller.signal;
}

function isPlaceholderChatflowId(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    normalized.includes('replace-with') ||
    normalized.includes('your-real') ||
    normalized.includes('real-flowise') ||
    normalized.includes('chatflow-id') ||
    normalized.startsWith('<') ||
    normalized.startsWith('{') ||
    normalized.includes('xxxxxxxx')
  );
}
