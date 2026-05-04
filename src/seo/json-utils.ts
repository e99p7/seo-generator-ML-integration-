export class EmptyLlmResponseError extends Error {
  constructor() {
    super('LLM returned an empty response');
    this.name = 'EmptyLlmResponseError';
  }
}

export class InvalidJsonError extends Error {
  constructor(message = 'LLM returned invalid JSON') {
    super(message);
    this.name = 'InvalidJsonError';
  }
}

export function extractFirstJsonObject(raw: string): unknown {
  const text = stripCodeFence(raw).trim();
  if (!text) throw new EmptyLlmResponseError();

  try {
    return JSON.parse(text);
  } catch {
    // Continue with balanced-brace extraction. LLMs sometimes wrap JSON in comments or markdown.
  }

  const jsonCandidate = findBalancedJsonObject(text);
  if (!jsonCandidate) {
    throw new InvalidJsonError('No JSON object found in LLM response');
  }

  try {
    return JSON.parse(jsonCandidate);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown JSON parse error';
    throw new InvalidJsonError(message);
  }
}

function stripCodeFence(value: string): string {
  return value
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/i, '')
    .trim();
}

function findBalancedJsonObject(value: string): string | null {
  const start = value.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < value.length; i += 1) {
    const char = value[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;

    if (depth === 0) {
      return value.slice(start, i + 1);
    }
  }

  return null;
}
