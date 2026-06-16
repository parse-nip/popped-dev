"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

const PLACEHOLDER_REPLY =
  "Agent pipeline coming in Phase 2. For now, describe what you want — dark theme, hero animation, project cards — and we will wire the Cursor SDK next.";

export function ChatPanel() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Hi! I will help you shape popped.dev around the locked portfolio below. What should we build first?",
    },
  ]);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);

  function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || isThinking) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsThinking(true);

    window.setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: PLACEHOLDER_REPLY,
        },
      ]);
      setIsThinking(false);
    }, 600);
  }

  return (
    <aside
      id="agent-chat"
      className="flex h-full flex-col border-l border-border bg-card"
      aria-label="Site builder agent"
    >
      <Card className="flex h-full flex-col rounded-none border-0 shadow-none">
        <CardHeader className="border-b py-4">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-sm font-semibold">Site builder</CardTitle>
            <Badge variant="outline" className="text-xs">
              Phase 1 shell
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="flex min-h-0 flex-1 flex-col gap-3 p-0">
          <ScrollArea className="h-[min(50vh,420px)] flex-1 px-4 py-3">
            <ul className="space-y-3">
              {messages.map((message) => (
                <li
                  key={message.id}
                  className={
                    message.role === "user"
                      ? "ml-8 rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"
                      : "mr-8 rounded-lg bg-muted px-3 py-2 text-sm"
                  }
                >
                  {message.content}
                </li>
              ))}
              {isThinking ? (
                <li className="mr-8 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                  Thinking…
                </li>
              ) : null}
            </ul>
          </ScrollArea>
        </CardContent>

        <CardFooter className="flex flex-col gap-2 border-t p-4">
          <div className="flex w-full gap-2">
            <Input
              placeholder="Describe a change…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              disabled={isThinking}
              aria-label="Message to site builder agent"
            />
            <Button type="button" onClick={handleSend} disabled={!input.trim() || isThinking}>
              Send
            </Button>
          </div>
          <p className="w-full text-xs text-muted-foreground">
            Preview → Confirm → PR → Checker agent → Merge (coming soon)
          </p>
        </CardFooter>
      </Card>
    </aside>
  );
}
