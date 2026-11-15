/**
 * AIProvider interface — swappable LLM backend.
 * Configure via env vars:
 *   AI_PROVIDER = "openai" | "anthropic" | "openai-compatible"
 *   AI_MODEL    = model name (e.g. "gpt-4o", "claude-3-5-sonnet-20241022")
 *   AI_API_KEY  = your API key
 *   AI_BASE_URL = (openai-compatible only) base URL
 */

export type ImageInput = {
  /** Base64-encoded image data */
  data: string;
  /** MIME type, e.g. "image/jpeg" */
  mimeType: string;
};

export type AIMessage = {
  role: "user" | "assistant";
  content: string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } } | { type: "image"; source: { type: "base64"; media_type: string; data: string } }>;
};

export interface AIProvider {
  /**
   * Complete a chat with optional image inputs.
   * Always returns the raw text response.
   */
  complete(params: {
    systemPrompt: string;
    messages: AIMessage[];
    images?: ImageInput[];
    maxTokens?: number;
    temperature?: number;
  }): Promise<string>;
}

export function createAIProvider(): AIProvider {
  const provider = process.env.AI_PROVIDER ?? "openai";

  switch (provider) {
    case "anthropic":
      return createAnthropicProvider();
    case "openai-compatible":
    case "openai":
    default:
      return createOpenAIProvider();
  }
}

// ─── OpenAI / OpenAI-compatible ───────────────────────────────────────────────

function createOpenAIProvider(): AIProvider {
  const apiKey = process.env.AI_API_KEY;
  const model = process.env.AI_MODEL ?? "gpt-4o";
  const baseURL = process.env.AI_BASE_URL ?? "https://api.openai.com/v1";

  return {
    async complete({ systemPrompt, messages, images, maxTokens = 2048, temperature = 0 }) {
      // Build the user content (text + images)
      const userContent: AIMessage["content"] = [];

      for (const msg of messages) {
        if (typeof msg.content === "string") {
          (userContent as Array<{ type: string; text?: string }>).push({ type: "text", text: msg.content });
        }
      }

      if (images?.length) {
        for (const img of images) {
          (userContent as Array<{ type: string; image_url?: { url: string } }>).push({
            type: "image_url",
            image_url: { url: `data:${img.mimeType};base64,${img.data}` },
          });
        }
      }

      const body = {
        model,
        max_tokens: maxTokens,
        temperature,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
      };

      const res = await fetch(`${baseURL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`OpenAI API error ${res.status}: ${err}`);
      }

      const data = await res.json();
      return data.choices?.[0]?.message?.content ?? "";
    },
  };
}

// ─── Anthropic ────────────────────────────────────────────────────────────────

function createAnthropicProvider(): AIProvider {
  const apiKey = process.env.AI_API_KEY;
  const model = process.env.AI_MODEL ?? "claude-3-5-sonnet-20241022";

  return {
    async complete({ systemPrompt, messages, images, maxTokens = 2048, temperature = 0 }) {
      const content: Array<Record<string, unknown>> = [];

      for (const msg of messages) {
        if (typeof msg.content === "string") {
          content.push({ type: "text", text: msg.content });
        }
      }

      if (images?.length) {
        for (const img of images) {
          content.push({
            type: "image",
            source: {
              type: "base64",
              media_type: img.mimeType,
              data: img.data,
            },
          });
        }
      }

      const body = {
        model,
        max_tokens: maxTokens,
        temperature,
        system: systemPrompt,
        messages: [{ role: "user", content }],
      };

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey ?? "",
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Anthropic API error ${res.status}: ${err}`);
      }

      const data = await res.json();
      const block = data.content?.find((b: { type: string }) => b.type === "text");
      return (block as { text: string } | undefined)?.text ?? "";
    },
  };
}
