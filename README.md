
# SEO Generator — ready-made local version + Flowise mode

It runs without OpenAI billing and without manually searching for `FLOWISE_CHATFLOW_ID'.

By default, the backend works directly with the local Ollama:

```text
POST /api/generate-seo -> NestJS -> Ollama -> SSE stream -> validated JSON
```

The Flowise mode is also left in the code and is described below.:

```text
POST /api/generate-seo -> NestJS -> Flowise Prediction API -> LLM Chain -> Structured Output Parser -> SSE stream -> validated JSON
```

## Fast startup without Flowise

Requirements:

- Node.js 18+
- npm
- Ollama
- model `qwen2.5:3b` or `qwen2.5:7b`

Check out Ollama:

```bash
curl http://127.0.0.1:11434/api/tags
```

If there is no model:

```bash
ollama pull qwen2.5:3b
```

Launching the backend:

```bash
npm install
cp .env.example .env
npm run start:dev
```

In another terminal:

```bash
npm run test:curl
```

Or manually:

```bash
curl -N -X POST "http://localhost:4000/api/generate-seo" \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  --data-binary @request.json
```

The expected response is SSE events:

```text
event: start
data: {"ok":true}

event: token
data: {"token":"..."}

event: result
data: {"title":"...","meta_description":"...","h1":"...","description":"...","bullets":["..."]}

event: done
data: "[DONE]"
```

## .default env

```env
PORT=4000
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5:3b
LLM_TEMPERATURE=0.1
OLLAMA_NUM_PREDICT=900
LLM_TIMEOUT_MS=300000
ENABLE_RULE_FALLBACK=true
```

`ENABLE_RULE_FALLBACK=true` means: if the local model freezes, returns an empty response, or breaks JSON, endpoint will still return valid JSON based on the input data. This is done so that the API is working even on a weak local machine. You can turn this off in production.:

```env
ENABLE_RULE_FALLBACK=false
```

## Endpoint

```http
POST /api/generate-seo
Content-Type: application/json
Accept: text/event-stream
```

Body:

``json
{
"product_name": "DeLonghi Magnifica S coffee machine",
  "category": "Coffee machines",
"keywords": ["coffee machine", "automatic coffee machine", "DeLonghi"]
}
``

## What is implemented

- NestJS endpoint `POST /api/generate-seo`.
- SSE streaming.
- Local LLM mode via Ollama.
- Optional Flowise Prediction API mode.
- Login validation via the `class-validator'.
- Validation of the result via the `zod'.
- Timeout processing.
- Processing an empty LLM response.
- Processing invalid JSON.
- Processing of non-2xx Flowise/Ollama response.
- Abort the upstream request during client disconnect.

## Flowise-mode, if you need to show Flowise specifically

Switch to `.env`:

```env
LLM_PROVIDER=flowise
FLOWISE_BASE_URL=http://localhost:3000
FLOWISE_CHATFLOW_ID=YOUR_ID_IS_BUTTON_API_IN_FLOWISE
FLOWISE_API_KEY=
```

Chatflow scheme:

```text
Prompt Template -> LLM Chain
Chat Model/Ollama/OpenAI -> LLM Chain
Structured Output Parser -> LLM Chain / Output Parser
```

Prompt Template variables:

```text
product_name
category
keywords
```

Prompt Template:

```text
You are an experienced SEO copywriter for e-commerce.

Generate an SEO product description in Russian.

Input data:
- Product name: {product_name}
- Category: {category}
- SEO keys: {keywords}

Requirements:
- Don't invent characteristics that aren't in the input data.
- Use keywords naturally, without spam.
- title: up to 60 characters.
- meta_description: 120-160 characters.
- h1: must contain the product name.
- description: 2-4 paragraphs.
- bullets: 4-6 brief advantages.
- Return only valid JSON without markdown.

Return the JSON strictly in this format:
{{
  "title": "string",
  "meta_description": "string",
  "h1": "string",
  "description": "string",
  "bullets": ["string"]
}}
```

Structured Output Parser fields:

```json
{
  "title": "SEO title, string, max 60 chars",
  "meta_description": "Meta description, string, 120-160 chars",
  "h1": "Page H1, string",
  "description": "Product SEO description, string",
  "bullets": "Array of 4-6 short selling points"
}
```

Important: if you are using `overrideConfig.promptValues` from the API, in Flowise you need to allow override prompt values in the chatflow/security settings. If you don't want to deal with this, use the default `LLM_PROVIDER=ollama` — it already works without Flowise.

## Why such parameters

- Chunking is not used because the task is not RAG: the input is short and fits into a single prompt.
- Temperature `0.1` is selected for stable JSON. For SEO creativity, you can raise it to `0.3`, but the risk of broken JSON is higher.
- `num_predict=900` limits the response length so that the local model does not take too long to generate.
- Structured Output Parser in Flowise is needed for a formal JSON contract.
- Zod validation on the NestJS side is mandatory, because LLM/parser are not reliable data boundaries.
- SSE is selected so that the client can see the generation, but the final `result` is given only after assembly, parsing and checking the JSON.

______________________________

# SEO Generator — готовый локальный вариант + Flowise-режим

Запускается без OpenAI billing и без ручного поиска `FLOWISE_CHATFLOW_ID`.

По умолчанию backend работает напрямую с локальной Ollama:

```text
POST /api/generate-seo -> NestJS -> Ollama -> SSE stream -> validated JSON
```

Flowise-режим тоже оставлен в коде и описан ниже:

```text
POST /api/generate-seo -> NestJS -> Flowise Prediction API -> LLM Chain -> Structured Output Parser -> SSE stream -> validated JSON
```

## Быстрый запуск без Flowise

Требования:

- Node.js 18+
- npm
- Ollama
- модель `qwen2.5:3b` или `qwen2.5:7b`

Проверить Ollama:

```bash
curl http://127.0.0.1:11434/api/tags
```

Если модели нет:

```bash
ollama pull qwen2.5:3b
```

Запуск backend:

```bash
npm install
cp .env.example .env
npm run start:dev
```

В другом терминале:

```bash
npm run test:curl
```

Или вручную:

```bash
curl -N -X POST "http://localhost:4000/api/generate-seo" \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  --data-binary @request.json
```

Ожидаемый ответ — SSE-события:

```text
event: start
data: {"ok":true}

event: token
data: {"token":"..."}

event: result
data: {"title":"...","meta_description":"...","h1":"...","description":"...","bullets":["..."]}

event: done
data: "[DONE]"
```

## .env по умолчанию

```env
PORT=4000
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5:3b
LLM_TEMPERATURE=0.1
OLLAMA_NUM_PREDICT=900
LLM_TIMEOUT_MS=300000
ENABLE_RULE_FALLBACK=true
```

`ENABLE_RULE_FALLBACK=true` означает: если локальная модель зависла, вернула пустой ответ или сломала JSON, endpoint всё равно вернёт валидный JSON на основе входных данных. Это сделано, чтобы API был рабочим даже на слабой локальной машине. В production это можно выключить:

```env
ENABLE_RULE_FALLBACK=false
```

## Endpoint

```http
POST /api/generate-seo
Content-Type: application/json
Accept: text/event-stream
```

Body:

```json
{
  "product_name": "Кофемашина DeLonghi Magnifica S",
  "category": "Кофемашины",
  "keywords": ["кофемашина", "автоматическая кофемашина", "DeLonghi"]
}
```

## Что реализовано

- NestJS endpoint `POST /api/generate-seo`.
- SSE streaming.
- Локальный LLM-режим через Ollama.
- Опциональный Flowise Prediction API mode.
- Валидация входа через `class-validator`.
- Валидация результата через `zod`.
- Обработка timeout.
- Обработка пустого ответа LLM.
- Обработка невалидного JSON.
- Обработка non-2xx ответа Flowise/Ollama.
- Abort upstream-запроса при client disconnect.

## Flowise-режим, если нужно показать именно Flowise

В `.env` переключить:

```env
LLM_PROVIDER=flowise
FLOWISE_BASE_URL=http://localhost:3000
FLOWISE_CHATFLOW_ID=ваш_id_из_кнопки_API_в_Flowise
FLOWISE_API_KEY=
```

Схема chatflow:

```text
Prompt Template -> LLM Chain
Chat Model/Ollama/OpenAI -> LLM Chain
Structured Output Parser -> LLM Chain / Output Parser
```

Prompt Template variables:

```text
product_name
category
keywords
```

Prompt Template:

```text
Ты опытный SEO-копирайтер для e-commerce.

Сгенерируй SEO-описание товара на русском языке.

Входные данные:
- Название товара: {product_name}
- Категория: {category}
- SEO-ключи: {keywords}

Требования:
- Не выдумывай характеристик, которых нет во входных данных.
- Ключевые слова используй естественно, без переспама.
- title: до 60 символов.
- meta_description: 120-160 символов.
- h1: должен содержать название товара.
- description: 2-4 абзаца.
- bullets: 4-6 кратких преимуществ.
- Верни только валидный JSON без markdown.

Верни JSON строго в таком формате:
{{
  "title": "string",
  "meta_description": "string",
  "h1": "string",
  "description": "string",
  "bullets": ["string"]
}}
```

Structured Output Parser fields:

```json
{
  "title": "SEO title, string, max 60 chars",
  "meta_description": "Meta description, string, 120-160 chars",
  "h1": "Page H1, string",
  "description": "Product SEO description, string",
  "bullets": "Array of 4-6 short selling points"
}
```

Важно: если используете `overrideConfig.promptValues` из API, в Flowise нужно разрешить override prompt values в настройках chatflow/security. Если не хотите с этим разбираться, используйте default `LLM_PROVIDER=ollama` — он уже работает без Flowise.

## Почему такие параметры

- Чанкинг не используется, потому что задача не RAG: вход короткий и помещается в один prompt.
- Temperature `0.1` выбрана для стабильного JSON. Для SEO-креативности можно поднять до `0.3`, но риск сломанного JSON выше.
- `num_predict=900` ограничивает длину ответа, чтобы локальная модель не генерировала слишком долго.
- Structured Output Parser в Flowise нужен для формального JSON-контракта.
- Zod-валидация на NestJS стороне оставлена обязательно, потому что LLM/parser не являются надёжной границей данных.
- SSE выбран, чтобы клиент видел генерацию, но финальный `result` отдаётся только после сборки, парсинга и проверки JSON.
