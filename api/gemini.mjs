const DEFAULT_MODEL = process.env.GEMINI_MODEL?.trim() || 'gemini-2.0-flash';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY?.trim();
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_MODEL}:generateContent`;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json'
    }
  });

const normalizeText = (value) =>
  value
    .replace(/^```[a-zA-Z]*\n?/, '')
    .replace(/\n?```$/, '')
    .trim();

export async function POST(request) {
  if (!GEMINI_API_KEY) {
    return json({ error: 'Missing GEMINI_API_KEY.' }, 500);
  }

  let payload;

  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }

  const prompt = payload?.prompt?.trim();
  const maxOutputTokens = Number(payload?.maxOutputTokens ?? 700);

  if (!prompt) {
    return json({ error: 'Prompt is required.' }, 400);
  }

  if (!Number.isFinite(maxOutputTokens) || maxOutputTokens <= 0 || maxOutputTokens > 8192) {
    return json({ error: 'maxOutputTokens must be between 1 and 8192.' }, 400);
  }

  try {
    const response = await fetch(GEMINI_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': GEMINI_API_KEY
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }]
          }
        ],
        generationConfig: {
          temperature: 0.7,
          topP: 0.9,
          maxOutputTokens
        }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return json(
        {
          error: data?.error?.message || `Gemini request failed with status ${response.status}.`
        },
        response.status
      );
    }

    if (data?.promptFeedback?.blockReason) {
      return json({ error: `Gemini blocked the prompt: ${data.promptFeedback.blockReason}.` }, 400);
    }

    const text = data?.candidates
      ?.flatMap((candidate) => candidate?.content?.parts ?? [])
      ?.map((part) => part?.text ?? '')
      ?.join('')
      ?.trim();

    if (!text) {
      return json({ error: 'Gemini returned an empty response.' }, 502);
    }

    return json({ text: normalizeText(text), model: DEFAULT_MODEL });
  } catch (error) {
    console.error('Gemini proxy request failed', error);
    return json({ error: 'Gemini proxy request failed.' }, 500);
  }
}
