export type FlowiseChunk = {
  token?: string;
  event?: string;
  metadata?: unknown;
  raw?: unknown;
};

export async function* parseFlowiseSseStream(stream: ReadableStream<Uint8Array>): AsyncGenerator<FlowiseChunk> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const events = splitCompletedSseEvents(buffer);
    buffer = events.remainder;

    for (const rawEvent of events.completed) {
      const parsed = parseSseEvent(rawEvent);
      if (parsed) yield parsed;
    }
  }

  buffer += decoder.decode();
  if (buffer.trim()) {
    const parsed = parseSseEvent(buffer);
    if (parsed) yield parsed;
  }
}

function splitCompletedSseEvents(buffer: string): { completed: string[]; remainder: string } {
  const normalized = buffer.replace(/\r\n/g, '\n');
  const parts = normalized.split('\n\n');
  const remainder = parts.pop() ?? '';
  return { completed: parts.filter((part) => part.trim()), remainder };
}

function parseSseEvent(rawEvent: string): FlowiseChunk | null {
  const dataLines = rawEvent
    .split(/\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice('data:'.length).trim());

  if (!dataLines.length) return null;

  const payload = dataLines.join('\n');
  if (!payload || payload === '[DONE]') return { event: 'end' };

  let json: unknown;
  try {
    json = JSON.parse(payload);
  } catch {
    return { token: payload, raw: payload };
  }

  const token = extractToken(json);
  const event = extractEvent(json);

  if (event === 'metadata') return { event, metadata: json, raw: json };
  if (event === 'end') return { event, raw: json };
  if (token !== undefined) return { event, token, raw: json };

  return { event, raw: json };
}

function extractEvent(value: unknown): string | undefined {
  if (isRecord(value) && typeof value.event === 'string') return value.event;
  return undefined;
}

function extractToken(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (!isRecord(value)) return undefined;

  if (typeof value.token === 'string') return value.token;
  if (typeof value.text === 'string') return value.text;
  if (typeof value.answer === 'string') return value.answer;
  if (typeof value.data === 'string' && value.event !== 'metadata' && value.event !== 'end') return value.data;

  if (isRecord(value.data)) {
    if (typeof value.data.token === 'string') return value.data.token;
    if (typeof value.data.text === 'string') return value.data.text;
  }

  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
