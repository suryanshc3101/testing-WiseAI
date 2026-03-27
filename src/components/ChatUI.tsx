"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  WORKFLOWS,
  PROGRESS_STEPS,
  QUICK_PROMPTS,
  type Workflow,
} from "@/lib/workflows";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

type Conversations = Record<string, Message[]>;

function Spinner({ size = 14, color = "#6366f1" }: { size?: number; color?: string }) {
  return (
    <span
      className="inline-block shrink-0 animate-spin rounded-full"
      style={{
        width: size,
        height: size,
        border: `2px solid ${color}22`,
        borderTopColor: color,
      }}
    />
  );
}

export default function ChatUI() {
  const [wfId, setWfId] = useState("icp_builder");
  const [convos, setConvos] = useState<Conversations>({});
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [streamingText, setStreamingText] = useState("");
  const [searchCount, setSearchCount] = useState(0);
  const [stats, setStats] = useState({ queries: 0, searches: 0 });

  const endRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const stepTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const stepIdxRef = useRef(0);

  const wf = WORKFLOWS[wfId];
  const chat = convos[wfId] || [];
  const steps = PROGRESS_STEPS[wfId] || [];

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat, busy, streamingText]);

  useEffect(() => {
    return () => {
      clearTimeout(stepTimerRef.current);
      clearInterval(elapsedTimerRef.current);
    };
  }, []);

  const resetProgress = useCallback(() => {
    clearTimeout(stepTimerRef.current);
    clearInterval(elapsedTimerRef.current);
    setBusy(false);
    setStepIdx(0);
    setElapsed(0);
    setStreamingText("");
    setSearchCount(0);
    stepIdxRef.current = 0;
  }, []);

  const stopAgent = useCallback(() => {
    try {
      abortRef.current?.abort();
    } catch {}
    resetProgress();
    setConvos((prev) => ({
      ...prev,
      [wfId]: [
        ...(prev[wfId] || []),
        {
          role: "assistant" as const,
          content: "Stopped. You can start a new query.",
          timestamp: Date.now(),
        },
      ],
    }));
  }, [wfId, resetProgress]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;

      const userMsg: Message = {
        role: "user",
        content: trimmed,
        timestamp: Date.now(),
      };
      const currentWf = wfId;

      setConvos((prev) => ({
        ...prev,
        [currentWf]: [...(prev[currentWf] || []), userMsg],
      }));
      setInput("");
      setBusy(true);
      setStepIdx(0);
      setElapsed(0);
      setStreamingText("");
      setSearchCount(0);
      stepIdxRef.current = 0;

      const ctrl = new AbortController();
      abortRef.current = ctrl;

      // Elapsed timer
      const t0 = Date.now();
      elapsedTimerRef.current = setInterval(
        () => setElapsed(Math.floor((Date.now() - t0) / 1000)),
        1000
      );

      // Step advancement
      const advanceStep = () => {
        const stepsArr = PROGRESS_STEPS[currentWf] || [];
        if (stepIdxRef.current < stepsArr.length - 1) {
          stepIdxRef.current++;
          setStepIdx(stepIdxRef.current);
          stepTimerRef.current = setTimeout(
            advanceStep,
            4000 + Math.random() * 3000
          );
        }
      };
      stepTimerRef.current = setTimeout(advanceStep, 3000);

      // Build message history for API
      const history = [...(convos[currentWf] || []), userMsg].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      let accumulated = "";
      let totalSearches = 0;

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workflowId: currentWf,
            messages: history,
          }),
          signal: ctrl.signal,
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          throw new Error(`API error ${res.status}: ${errText.slice(0, 200)}`);
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error("No response stream");

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const jsonStr = line.slice(6);
            try {
              const event = JSON.parse(jsonStr);

              if (event.type === "text") {
                accumulated += event.text;
                setStreamingText(accumulated);
              } else if (event.type === "search_done") {
                totalSearches++;
                setSearchCount(totalSearches);
              } else if (event.type === "error") {
                throw new Error(event.error);
              } else if (event.type === "done") {
                // Stream complete
              }
            } catch (parseErr) {
              if (
                parseErr instanceof Error &&
                parseErr.message !== "Unexpected end of JSON input"
              ) {
                // Re-throw non-parse errors
                if (!jsonStr.startsWith("{")) continue;
                throw parseErr;
              }
            }
          }
        }

        resetProgress();

        const finalContent = accumulated || "Done.";
        setConvos((prev) => ({
          ...prev,
          [currentWf]: [
            ...(prev[currentWf] || []),
            {
              role: "assistant" as const,
              content: finalContent,
              timestamp: Date.now(),
            },
          ],
        }));
        setStats((prev) => ({
          queries: prev.queries + 1,
          searches: prev.searches + totalSearches,
        }));
      } catch (err) {
        resetProgress();
        if (err instanceof Error && err.name === "AbortError") return;
        const errMsg =
          err instanceof Error ? err.message : "Unknown error occurred";
        setConvos((prev) => ({
          ...prev,
          [currentWf]: [
            ...(prev[currentWf] || []),
            {
              role: "assistant" as const,
              content: `Error: ${errMsg}\n\nPlease try again.`,
              timestamp: Date.now(),
            },
          ],
        }));
      }
    },
    [wfId, convos, busy, resetProgress]
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#060a13] font-sans text-slate-200">
      {/* Sidebar */}
      <div
        className="flex shrink-0 flex-col overflow-hidden border-r border-slate-800 bg-[#0a0f1a] transition-all duration-300"
        style={{ width: sidebarOpen ? 260 : 0 }}
      >
        {/* Logo */}
        <div className="flex items-center gap-2.5 border-b border-slate-800 px-4 py-3.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-cyan-500 text-sm font-bold text-white">
            W
          </div>
          <div>
            <div className="text-sm font-bold">
              Wise<span className="text-indigo-500">AI</span>
            </div>
            <div className="text-[10px] text-slate-500">
              Agentic Sales Intelligence
            </div>
          </div>
        </div>

        {/* Workflow list */}
        <div className="flex-1 overflow-auto p-2">
          <div className="mb-1.5 px-2 text-[10px] font-bold uppercase tracking-widest text-slate-600">
            Workflows
          </div>
          {Object.values(WORKFLOWS).map((w: Workflow) => (
            <button
              key={w.id}
              onClick={() => !busy && setWfId(w.id)}
              disabled={busy && wfId !== w.id}
              className="mb-0.5 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors"
              style={{
                background: wfId === w.id ? `${w.color}14` : "transparent",
                borderLeft:
                  wfId === w.id
                    ? `3px solid ${w.color}`
                    : "3px solid transparent",
                opacity: busy && wfId !== w.id ? 0.4 : 1,
              }}
            >
              <span className="text-base">{w.icon}</span>
              <div>
                <div
                  className="text-xs font-semibold"
                  style={{ color: wfId === w.id ? w.color : "#cbd5e1" }}
                >
                  {w.label}
                </div>
                <div className="text-[10px] text-slate-500">{w.desc}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Main panel */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <div className="flex items-center gap-2.5 border-b border-slate-800 bg-[#0a0f1a] px-4 py-2">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="rounded-md border border-slate-800 px-2 py-1 text-xs text-slate-400 hover:bg-slate-800"
          >
            ☰
          </button>
          <div
            className="flex h-7 w-7 items-center justify-center rounded-lg text-sm"
            style={{ background: `${wf.color}16` }}
          >
            {wf.icon}
          </div>
          <div className="flex-1">
            <div className="text-[13px] font-bold">{wf.label}</div>
            <div className="text-[10px] text-slate-500">{wf.desc}</div>
          </div>
          {busy && (
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 text-[11px] font-semibold"
              style={{ background: `${wf.color}16`, color: wf.color }}
            >
              <Spinner size={9} color={wf.color} />
              {steps[stepIdx] || "Working..."}
            </span>
          )}
          <div className="flex gap-1.5">
            {[
              { val: stats.queries, label: "Queries", color: "#6366f1" },
              { val: stats.searches, label: "Searches", color: "#06b6d4" },
            ].map((s) => (
              <div
                key={s.label}
                className="rounded-lg border border-slate-800 bg-[#0d1117] px-2.5 py-1 text-center"
              >
                <div className="text-sm font-bold" style={{ color: s.color }}>
                  {s.val}
                </div>
                <div className="text-[9px] text-slate-500">{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Chat area */}
        <div className="flex flex-1 flex-col overflow-auto p-4">
          {chat.length === 0 && !busy ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-4">
              <div
                className="flex h-14 w-14 items-center justify-center rounded-2xl border-2 text-3xl"
                style={{
                  background: `${wf.color}10`,
                  borderColor: `${wf.color}28`,
                }}
              >
                {wf.icon}
              </div>
              <div className="text-center">
                <div className="mb-1 text-base font-bold">
                  {wf.label} Agent
                </div>
                <div className="max-w-sm text-xs text-slate-500">
                  AI agent that researches real-time data to{" "}
                  {wf.desc.toLowerCase()}.
                </div>
              </div>
              <div className="mt-2 flex w-full max-w-md flex-col gap-2">
                {(QUICK_PROMPTS[wfId] || []).map((q, i) => (
                  <button
                    key={i}
                    onClick={() => send(q)}
                    className="rounded-xl border border-slate-800 bg-[#111827] px-4 py-2.5 text-left text-xs text-slate-300 transition-colors hover:border-indigo-500"
                    style={{ animationDelay: `${i * 70}ms` }}
                  >
                    <span style={{ color: wf.color }} className="mr-1">
                      →
                    </span>{" "}
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {chat.map((m, i) => (
                <div
                  key={i}
                  className={`mb-3 flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}
                >
                  {m.role === "assistant" && (
                    <div
                      className="mb-0.5 flex items-center gap-1 text-[11px] font-semibold"
                      style={{ color: wf.color }}
                    >
                      {wf.icon} {wf.label} Agent
                    </div>
                  )}
                  <div
                    className="max-w-[90%] whitespace-pre-wrap break-words px-4 py-3 text-[13px] leading-relaxed"
                    style={{
                      borderRadius:
                        m.role === "user"
                          ? "14px 14px 3px 14px"
                          : "14px 14px 14px 3px",
                      background:
                        m.role === "user"
                          ? `linear-gradient(135deg, ${wf.color}, ${wf.color}bb)`
                          : "#111827",
                      color: m.role === "user" ? "#fff" : "#e2e8f0",
                      border:
                        m.role === "user" ? "none" : "1px solid #1e293b",
                    }}
                  >
                    {m.content}
                  </div>
                  <div className="mt-0.5 text-[9px] text-slate-700">
                    {new Date(m.timestamp).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
              ))}

              {/* Streaming text */}
              {busy && streamingText && (
                <div className="mb-3 flex flex-col items-start">
                  <div
                    className="mb-0.5 flex items-center gap-1 text-[11px] font-semibold"
                    style={{ color: wf.color }}
                  >
                    {wf.icon} {wf.label} Agent
                  </div>
                  <div
                    className="max-w-[90%] whitespace-pre-wrap break-words border border-slate-800 bg-[#111827] px-4 py-3 text-[13px] leading-relaxed text-slate-200"
                    style={{ borderRadius: "14px 14px 14px 3px" }}
                  >
                    {streamingText}
                    <span className="ml-1 inline-block h-3 w-0.5 animate-pulse bg-indigo-400" />
                  </div>
                </div>
              )}

              {/* Progress panel */}
              {busy && (
                <div
                  className="mb-3 rounded-xl border p-4"
                  style={{
                    background: "#0a0f1a",
                    borderColor: `${wf.color}20`,
                  }}
                >
                  <div className="mb-3 flex items-center gap-2 border-b border-slate-800 pb-2">
                    <div
                      className="flex h-6 w-6 items-center justify-center rounded-md text-xs"
                      style={{ background: `${wf.color}18` }}
                    >
                      {wf.icon}
                    </div>
                    <div className="flex-1">
                      <div className="text-xs font-bold">
                        {wf.label} Agent Working
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {elapsed}s elapsed
                        {searchCount > 0 &&
                          ` · ${searchCount} web search${searchCount > 1 ? "es" : ""}`}
                      </div>
                    </div>
                    <button
                      onClick={stopAgent}
                      className="flex items-center gap-1.5 rounded-md border border-red-500/25 bg-red-500/10 px-3 py-1 text-[11px] font-semibold text-red-400 hover:bg-red-500/20"
                    >
                      <span className="inline-block h-2 w-2 rounded-sm bg-red-400" />
                      Stop
                    </button>
                  </div>
                  {steps.map((s, i) => {
                    const done = i < stepIdx;
                    const active = i === stepIdx;
                    return (
                      <div
                        key={i}
                        className="flex items-center gap-2 py-1 transition-opacity duration-300"
                        style={{ opacity: i > stepIdx ? 0.22 : 1 }}
                      >
                        <div
                          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[9px]"
                          style={{
                            background: done
                              ? `${wf.color}18`
                              : active
                                ? `${wf.color}10`
                                : "#111827",
                            border: active
                              ? `2px solid ${wf.color}`
                              : done
                                ? `2px solid ${wf.color}40`
                                : "2px solid #1e293b",
                            boxShadow: active
                              ? `0 0 8px ${wf.color}22`
                              : "none",
                          }}
                        >
                          {done ? (
                            <span
                              className="font-bold"
                              style={{ color: wf.color }}
                            >
                              ✓
                            </span>
                          ) : active ? (
                            <Spinner size={8} color={wf.color} />
                          ) : (
                            <span className="text-slate-600">{i + 1}</span>
                          )}
                        </div>
                        <div
                          className="text-[11px]"
                          style={{
                            fontWeight: active ? 700 : done ? 600 : 400,
                            color: active
                              ? "#f1f5f9"
                              : done
                                ? "#94a3b8"
                                : "#475569",
                          }}
                        >
                          {s}
                          {done && (
                            <span
                              className="ml-1 text-[9px]"
                              style={{ color: `${wf.color}66` }}
                            >
                              Done
                            </span>
                          )}
                        </div>
                        {active && (
                          <div className="ml-1 h-0.5 flex-1 overflow-hidden rounded bg-slate-800">
                            <div
                              className="h-full animate-pulse rounded"
                              style={{ background: wf.color, width: "60%" }}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              <div ref={endRef} />
            </>
          )}
        </div>

        {/* Input area */}
        <div className="border-t border-slate-800 bg-[#0a0f1a] px-4 py-2.5">
          {busy ? (
            <div className="flex items-center gap-2">
              <div className="flex flex-1 items-center gap-2 rounded-xl border border-slate-800 bg-[#111827] px-4 py-2.5 text-xs text-slate-500">
                <Spinner size={12} color={wf.color} />
                Agent is researching... stop anytime
              </div>
              <button
                onClick={stopAgent}
                className="flex shrink-0 items-center gap-1.5 rounded-xl bg-gradient-to-r from-red-600 to-red-700 px-4 py-2.5 text-xs font-bold text-white hover:from-red-500 hover:to-red-600"
              >
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-white" />
                Stop
              </button>
            </div>
          ) : (
            <div className="flex items-end gap-2 rounded-xl border border-slate-800 bg-[#111827] p-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={`Message ${wf.label} Agent... (Enter to send)`}
                rows={1}
                className="max-h-24 min-h-[24px] flex-1 resize-none bg-transparent p-1 text-[13px] text-slate-200 placeholder-slate-600 focus:outline-none"
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = "auto";
                  target.style.height =
                    Math.min(target.scrollHeight, 96) + "px";
                }}
              />
              <button
                onClick={() => send(input)}
                disabled={!input.trim()}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm transition-colors"
                style={{
                  background: input.trim()
                    ? `linear-gradient(135deg, ${wf.color}, ${wf.color}bb)`
                    : "#1e293b",
                  color: input.trim() ? "#fff" : "#475569",
                  cursor: input.trim() ? "pointer" : "default",
                }}
              >
                ↑
              </button>
            </div>
          )}
          <div className="mt-1.5 text-center text-[9px] text-slate-800">
            Powered by WiseAI
          </div>
        </div>
      </div>
    </div>
  );
}
