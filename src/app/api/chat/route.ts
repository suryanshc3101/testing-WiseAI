import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPTS } from "@/lib/workflows";

const anthropic = new Anthropic();

export const maxDuration = 120;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { workflowId, messages } = await req.json();

  const systemPrompt = SYSTEM_PROMPTS[workflowId];
  if (!systemPrompt) {
    return new Response(JSON.stringify({ error: "Invalid workflow" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const apiMessages = messages.map((m: { role: string; content: string }) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  const send = async (data: Record<string, unknown>) => {
    await writer.write(
      encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
    );
  };

  // Run the streaming in the background so the Response starts immediately
  (async () => {
    try {
      const rawStream = anthropic.messages.stream({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: systemPrompt,
        messages: apiMessages,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tools: [
          {
            type: "web_search_20250305",
            name: "web_search",
            max_uses: 10,
          },
        ] as any,
      });

      rawStream.on("text", (text) => {
        send({ type: "text", text });
      });

      rawStream.on("contentBlock", (block) => {
        if (block.type === "server_tool_use") {
          send({ type: "tool_use", tool: block.name });
        }
        if (block.type === "web_search_tool_result") {
          send({ type: "search_done" });
        }
      });

      await rawStream.finalMessage();
      await send({ type: "done" });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error";
      await send({ type: "error", error: message });
    } finally {
      await writer.close();
    }
  })();

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
