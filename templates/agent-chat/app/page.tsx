"use client";

import { useEffect, useRef, useState } from "react";

interface Conversation {
  id: string;
  title: string;
  at: string;
}
interface Message {
  role: "user" | "assistant";
  text: string;
}
interface Approval {
  id: string;
  tool: string;
  detail: string;
}

const TITLE = process.env.NEXT_PUBLIC_AGENT_TITLE || "Agent";

/** The chat: your conversations on the left, the open one on the right. */
export default function Chat() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [approval, setApproval] = useState<Approval | null>(null);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);

  const loadList = () => fetch("/api/conversations").then((r) => r.json()).then((d) => setConversations(d.conversations ?? [])).catch(() => {});
  useEffect(() => { loadList(); }, []);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, approval]);

  async function openConversation(id: string) {
    setOpen(id);
    setApproval(null);
    setError(null);
    const d = await fetch(`/api/conversations?id=${encodeURIComponent(id)}`).then((r) => r.json()).catch(() => null);
    setMessages(d?.messages ?? []);
  }

  function newConversation() {
    setOpen(null);
    setMessages([]);
    setApproval(null);
    setError(null);
  }

  /** Read the streamed reply into the last (assistant) message. */
  async function stream(res: Response) {
    if (!res.ok || !res.body) {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "Something went wrong.");
      return;
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const parts = buf.split("\n\n");
      buf = parts.pop() ?? "";
      for (const p of parts) {
        if (!p.startsWith("data: ")) continue;
        const e = JSON.parse(p.slice(6));
        if (e.type === "text") setMessages((m) => [...m.slice(0, -1), { role: "assistant", text: m[m.length - 1].text + e.text }]);
        if (e.type === "approval") setApproval({ id: e.id, tool: e.tool, detail: e.detail });
        if (e.type === "error") setError(e.message);
        if (e.type === "done" && e.conversation) setOpen(e.conversation);
      }
    }
  }

  async function sendMessage() {
    const message = text.trim();
    if (!message || busy) return;
    setText("");
    setError(null);
    setBusy(true);
    setMessages((m) => [...m, { role: "user", text: message }, { role: "assistant", text: "" }]);
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversation: open, message }),
    });
    await stream(res);
    setBusy(false);
    loadList();
  }

  async function answer(allow: boolean) {
    if (!approval || !open) return;
    const a = approval;
    setApproval(null);
    setBusy(true);
    setMessages((m) => [...m, { role: "assistant", text: "" }]);
    const res = await fetch("/api/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversation: open, approval: a.id, allow }),
    });
    await stream(res);
    setBusy(false);
  }

  return (
    <div className="shell">
      <aside>
        <div className="brand">{TITLE}</div>
        <button className="new" onClick={newConversation}>+ New conversation</button>
        <nav>
          {conversations.map((c) => (
            <button key={c.id} className={c.id === open ? "item on" : "item"} onClick={() => openConversation(c.id)}>
              {c.title}
            </button>
          ))}
        </nav>
      </aside>
      <main className="chat">
        <div className="messages">
          {!messages.length && <p className="muted hello">Ask {TITLE} anything it can help with.</p>}
          {messages.map((m, i) => (
            <div key={i} className={`msg ${m.role}`}>
              {m.text || (busy && i === messages.length - 1 ? <span className="muted">Working on it…</span> : null)}
            </div>
          ))}
          {approval && (
            <div className="approval">
              <p>
                The agent wants to run <strong>{approval.tool}</strong>. Okay?
              </p>
              <pre>{approval.detail}</pre>
              <button onClick={() => answer(true)}>Approve</button>
              <button className="ghost" onClick={() => answer(false)}>Don&apos;t approve</button>
            </div>
          )}
          {error && <p className="error">{error}</p>}
          <div ref={end} />
        </div>
        <div className="composer">
          <textarea
            rows={3}
            placeholder="Write a message…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
          />
          <button onClick={sendMessage} disabled={busy || !text.trim() || !!approval}>
            Send
          </button>
        </div>
      </main>
    </div>
  );
}
