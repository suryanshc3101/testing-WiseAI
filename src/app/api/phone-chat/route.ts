import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPTS } from "@/lib/workflows";
import {
  takeScreenshot,
  tap,
  swipe,
  typeText,
  pressKey,
  listApps,
  launchApp,
  adbShell,
  checkAdbConnected,
} from "@/lib/adb";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const anthropic = new Anthropic();

const PHONE_TOOLS: Anthropic.Tool[] = [
  {
    name: "take_screenshot",
    description:
      "Capture the current phone screen as an image. Always call this first to see what is on the screen, and after each action to verify results.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "tap",
    description:
      "Tap at a specific (x, y) coordinate on the phone screen. Common resolutions: 1080x2400, 1080x1920. Top-left is (0,0).",
    input_schema: {
      type: "object" as const,
      properties: {
        x: { type: "number", description: "Horizontal pixel coordinate" },
        y: { type: "number", description: "Vertical pixel coordinate" },
      },
      required: ["x", "y"],
    },
  },
  {
    name: "swipe",
    description:
      "Perform a swipe gesture from (x1,y1) to (x2,y2). Use for scrolling, opening notifications, switching apps, etc.",
    input_schema: {
      type: "object" as const,
      properties: {
        x1: { type: "number", description: "Start X coordinate" },
        y1: { type: "number", description: "Start Y coordinate" },
        x2: { type: "number", description: "End X coordinate" },
        y2: { type: "number", description: "End Y coordinate" },
        duration_ms: {
          type: "number",
          description: "Swipe duration in milliseconds (default 300)",
        },
      },
      required: ["x1", "y1", "x2", "y2"],
    },
  },
  {
    name: "type_text",
    description:
      "Type text into the currently focused input field. Spaces are supported. Keep text simple (avoid complex unicode).",
    input_schema: {
      type: "object" as const,
      properties: {
        text: { type: "string", description: "Text to type" },
      },
      required: ["text"],
    },
  },
  {
    name: "press_key",
    description:
      "Press a hardware or system key. Supported keys: HOME, BACK, MENU, VOLUME_UP, VOLUME_DOWN, POWER, ENTER, DELETE, SEARCH, RECENT_APPS, NOTIFICATIONS.",
    input_schema: {
      type: "object" as const,
      properties: {
        key: {
          type: "string",
          description:
            "Key name: HOME | BACK | MENU | VOLUME_UP | VOLUME_DOWN | POWER | ENTER | DELETE | SEARCH | RECENT_APPS | NOTIFICATIONS",
        },
      },
      required: ["key"],
    },
  },
  {
    name: "list_apps",
    description: "List installed third-party apps (package names) on the phone.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "launch_app",
    description:
      "Launch an app by its package name (e.g. com.google.android.youtube). Use list_apps to find package names.",
    input_schema: {
      type: "object" as const,
      properties: {
        package: {
          type: "string",
          description: "Android package name, e.g. com.example.app",
        },
      },
      required: ["package"],
    },
  },
  {
    name: "adb_shell",
    description:
      "Run any ADB shell command on the Android device. Use for advanced operations not covered by other tools.",
    input_schema: {
      type: "object" as const,
      properties: {
        command: {
          type: "string",
          description: "Shell command to run on the Android device",
        },
      },
      required: ["command"],
    },
  },
];

type ToolInput = Record<string, unknown>;

interface ToolExecResult {
  text: string;
  screenshotData?: string; // base64 PNG, only for take_screenshot
}

function executeTool(name: string, input: ToolInput): ToolExecResult {
  switch (name) {
    case "take_screenshot": {
      const result = takeScreenshot();
      if (result.data) {
        return {
          text: "Screenshot captured successfully.",
          screenshotData: result.data,
        };
      }
      return { text: `Screenshot failed: ${result.error}` };
    }

    case "tap": {
      const r = tap(Number(input.x), Number(input.y));
      return {
        text: r.success
          ? `Tapped at (${input.x}, ${input.y}).`
          : `Tap failed: ${r.stderr || "unknown error"}`,
      };
    }

    case "swipe": {
      const r = swipe(
        Number(input.x1),
        Number(input.y1),
        Number(input.x2),
        Number(input.y2),
        input.duration_ms ? Number(input.duration_ms) : 300
      );
      return {
        text: r.success
          ? `Swiped from (${input.x1},${input.y1}) to (${input.x2},${input.y2}).`
          : `Swipe failed: ${r.stderr || "unknown error"}`,
      };
    }

    case "type_text": {
      const r = typeText(String(input.text));
      return {
        text: r.success
          ? `Typed: "${input.text}"`
          : `Type failed: ${r.stderr || "unknown error"}`,
      };
    }

    case "press_key": {
      const r = pressKey(String(input.key));
      return {
        text: r.success
          ? `Pressed key: ${input.key}`
          : `Key press failed: ${r.stderr || "unknown error"}`,
      };
    }

    case "list_apps": {
      const r = listApps();
      const packages = r.stdout
        .split("\n")
        .map((l) => l.replace("package:", "").trim())
        .filter(Boolean)
        .join("\n");
      return {
        text: r.success
          ? `Installed apps:\n${packages}`
          : `List apps failed: ${r.stderr}`,
      };
    }

    case "launch_app": {
      const r = launchApp(String(input.package));
      return {
        text: r.success
          ? `Launched ${input.package}`
          : `Launch failed: ${r.stderr || "unknown error"}`,
      };
    }

    case "adb_shell": {
      const r = adbShell(String(input.command));
      const out = (r.stdout + (r.stderr ? `\nSTDERR: ${r.stderr}` : "")).trim();
      return { text: out || (r.success ? "(no output)" : "Command failed") };
    }

    default:
      return { text: `Unknown tool: ${name}` };
  }
}

function buildToolResultContent(
  execResult: ToolExecResult
): Anthropic.ToolResultBlockParam["content"] {
  if (execResult.screenshotData) {
    return [
      {
        type: "image",
        source: {
          type: "base64",
          media_type: "image/png",
          data: execResult.screenshotData,
        },
      },
      { type: "text", text: execResult.text },
    ];
  }
  return execResult.text;
}

export async function POST(req: Request) {
  const { messages } = await req.json();

  const systemPrompt = SYSTEM_PROMPTS["phone_control"];
  if (!systemPrompt) {
    return new Response(JSON.stringify({ error: "Invalid workflow" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  const send = async (data: Record<string, unknown>) => {
    await writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
  };

  (async () => {
    try {
      // Check ADB connection upfront and inform Claude
      const { connected, device } = checkAdbConnected();
      const adbStatus = connected
        ? `ADB device connected: ${device}`
        : "WARNING: No ADB device detected. Inform the user and guide them to connect their phone.";

      // Build API messages from chat history
      const apiMessages: Anthropic.MessageParam[] = messages.map(
        (m: { role: string; content: string }) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })
      );

      // Agentic tool-use loop: call Claude → execute tools → feed results back
      let iteration = 0;
      const MAX_ITERATIONS = 20; // safety cap

      while (iteration++ < MAX_ITERATIONS) {
        const stream = anthropic.messages.stream({
          model: "claude-sonnet-4-20250514",
          max_tokens: 4096,
          system: `${systemPrompt}\n\nCurrent ADB status: ${adbStatus}`,
          messages: apiMessages,
          tools: PHONE_TOOLS,
        });

        // Stream text tokens to the client in real time
        stream.on("text", (text) => {
          send({ type: "text", text });
        });

        const finalMsg = await stream.finalMessage();

        if (
          finalMsg.stop_reason === "end_turn" ||
          finalMsg.stop_reason !== "tool_use"
        ) {
          // No more tools to run — we're done
          break;
        }

        // Collect tool_use blocks from the response
        const toolUseBlocks = finalMsg.content.filter(
          (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
        );

        // Add assistant message to history (with tool_use content)
        apiMessages.push({ role: "assistant", content: finalMsg.content });

        // Execute each tool and collect results
        const toolResults: Anthropic.ToolResultBlockParam[] = [];

        for (const toolUse of toolUseBlocks) {
          await send({ type: "tool_start", tool: toolUse.name });

          const execResult = executeTool(
            toolUse.name,
            toolUse.input as ToolInput
          );

          // If it's a screenshot, push the image to the UI
          if (execResult.screenshotData) {
            await send({
              type: "screenshot",
              data: execResult.screenshotData,
            });
          }

          await send({
            type: "tool_result",
            tool: toolUse.name,
            result: execResult.text.slice(0, 200),
          });

          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: buildToolResultContent(execResult),
          });
        }

        // Feed tool results back to Claude for the next turn
        apiMessages.push({ role: "user", content: toolResults });
      }

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
