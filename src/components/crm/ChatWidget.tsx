import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { MessageSquareText, X, SendHorizonal } from "lucide-react";
import { toast } from "sonner";
import { sendChatMessage, type ChatMessage } from "@/lib/chat.functions";
import { cn } from "@/lib/utils";

const GREETING: ChatMessage = {
  role: "assistant",
  content: "Hi! Track an order, ask about products, or reach a human agent.",
};

function newSessionId() {
  return `sess-${Math.random().toString(36).slice(2, 8)}`;
}

export function ChatWidget() {
  const send = useServerFn(sendChatMessage);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [sessionId] = useState(newSessionId);
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open, pending]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || pending) return;
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setInput("");
    setPending(true);
    try {
      const result = await send({ data: { sessionId, messages: next } });
      setMessages([...next, { role: "assistant", content: result.reply }]);
      if (result.ticketCreated) {
        toast.success("Support ticket created", {
          description: "The inquiry was logged for the team.",
        });
        queryClient.invalidateQueries({ queryKey: ["inquiries"] });
      }
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    } catch {
      setMessages([
        ...next,
        {
          role: "assistant",
          content: "Sorry, I couldn't reach support right now. Please try again in a moment.",
        },
      ]);
    } finally {
      setPending(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open support assistant"
        className="fixed bottom-6 right-6 size-14 rounded-full bg-brand text-brand-foreground grid place-items-center shadow-2xl shadow-black/50 hover:brightness-110 transition"
      >
        <MessageSquareText className="size-6" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 w-[360px] max-w-[calc(100vw-2rem)] rounded-xl bg-panel border border-line shadow-2xl shadow-black/50 overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 bg-panel2 border-b border-line">
        <div className="size-9 rounded-full grid place-items-center bg-brand text-brand-foreground font-display font-semibold">
          AI
        </div>
        <div>
          <div className="text-sm font-medium">Meemza Assistant</div>
          <div className="text-[11px] text-teal flex items-center gap-1">
            <span className="size-1.5 rounded-full bg-teal live-dot" /> Online · tracks orders &
            products
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close support assistant"
          className="ml-auto text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="size-4" />
        </button>
      </div>

      <div ref={scrollRef} className="p-4 space-y-3 h-72 overflow-y-auto">
        {messages.map((m, i) => (
          <div
            key={i}
            className={cn(
              "max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-line",
              m.role === "user"
                ? "ml-auto rounded-tr-sm bg-brand text-brand-foreground font-medium"
                : "rounded-tl-sm bg-panel2 text-foreground/90",
            )}
          >
            {m.content}
          </div>
        ))}
        {pending && (
          <div className="max-w-[85%] rounded-lg rounded-tl-sm bg-panel2 px-3 py-2 text-sm text-muted-foreground">
            Checking…
          </div>
        )}
      </div>

      <form onSubmit={handleSend} className="px-3 pb-3">
        <div className="flex items-center gap-2 rounded-md bg-panel2 border border-line px-3 py-2">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <button
            type="submit"
            disabled={pending}
            aria-label="Send message"
            className="text-brand disabled:opacity-40"
          >
            <SendHorizonal className="size-4" />
          </button>
        </div>
      </form>
    </div>
  );
}
