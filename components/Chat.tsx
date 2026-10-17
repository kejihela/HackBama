"use client";

import { useEffect, useRef, useState } from "react";
import { SafetyCaution, type CautionProps } from "./SafetyCaution";
import { avatarColor, initials } from "@/lib/format";

type Msg = { id: number; sender_id: number; sender_name: string; body: string; created_at: number };
type Person = { id: number; name: string; email: string; campus: string; role: string };

const clock = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/** Live thread: polls every 2.5s. Swap for websockets/Supabase Realtime at scale. */
export function Chat({ threadId, meId, initial, people }: { threadId: number; meId: number; initial: Msg[]; people: Person[] }) {
  const me = people.find((p) => p.id === meId);
  const others = people.filter((p) => p.id !== meId);
  const roleOf = (id: number) => people.find((p) => p.id === id)?.role;
  const [msgs, setMsgs] = useState<Msg[]>(initial);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [blocked, setBlocked] = useState<CautionProps | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastId = msgs.length ? msgs[msgs.length - 1].id : 0;

  useEffect(() => {
    const t = setInterval(async () => {
      const res = await fetch(`/api/threads/${threadId}?after=${lastId}`, { cache: "no-store" });
      if (!res.ok) return;
      const fresh: Msg[] = await res.json();
      if (fresh.length) setMsgs((m) => [...m, ...fresh.filter((f) => !m.some((x) => x.id === f.id))]);
    }, 2500);
    return () => clearInterval(t);
  }, [threadId, lastId]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs.length]);

  useEffect(() => {
    if (!blocked) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [blocked]);

  function close() {
    setBlocked(null);
    inputRef.current?.focus();
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    const res = await fetch(`/api/threads/${threadId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body, after: lastId }),
    });
    if (res.ok) {
      const fresh: Msg[] = await res.json();
      setMsgs((m) => [...m, ...fresh.filter((f) => !m.some((x) => x.id === f.id))]);
      setText("");
    } else if (res.status === 422) {
      // Not sent. Keep the draft so the sender can fix it.
      setBlocked((await res.json()).blocked);
    }
    setSending(false);
  }

  return (
    <div className="panel chat" style={{ padding: 0, position: "relative" }}>
      <div className="chat-head">
        <span className="small">
          Signed in as <b>{me?.name ?? "you"}</b>
          {me && <span className="role-tag">{me.role}</span>}
        </span>
        <span className="small chat-with">
          with{" "}
          {others.map((p, i) => (
            <span key={p.id}>
              {i > 0 && ", "}
              <b title={`${p.email} · ${p.campus}`}>{p.name}</b> <span className="faint">({p.role.toLowerCase()}, {p.campus})</span>
            </span>
          ))}
        </span>
      </div>
      <div className="chat-log" ref={logRef}>
        {msgs.length === 0 && <p className="faint small" style={{ textAlign: "center", marginTop: 40 }}>Say hi and pick a meetup spot.</p>}
        {msgs.map((m, i) => {
          const mine = m.sender_id === meId;
          // Label each run of messages from the same person, not every bubble.
          const first = i === 0 || msgs[i - 1].sender_id !== m.sender_id;
          const role = roleOf(m.sender_id);
          return (
            <div key={m.id} className={`msg ${mine ? "mine" : ""}`}>
              {first && (
                <div className="msg-who">
                  <span className="avatar" style={{ background: avatarColor(m.sender_id), width: 22, height: 22, fontSize: 9 }}>
                    {initials(m.sender_name)}
                  </span>
                  <b>{mine ? `You (${m.sender_name})` : m.sender_name}</b>
                  {role && <span className="role-tag">{role}</span>}
                </div>
              )}
              <div className={`bubble ${mine ? "mine" : ""}`} title={clock(m.created_at)}>
                {m.body}
              </div>
            </div>
          );
        })}
      </div>
      <form className="chat-form" onSubmit={send}>
        <input ref={inputRef} className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Message…" maxLength={2000} disabled={!!blocked?.suspended} />
        <button className="btn btn-primary" disabled={sending || !!blocked?.suspended}>{sending ? "Checking…" : "Send"}</button>
      </form>
      <p className="faint" style={{ fontSize: 11, padding: "0 14px 10px" }}>
        Messages are screened for harassment, sexual content, personal info and off-platform payments before they&apos;re delivered.
      </p>

      {blocked && (
        <div className="modal-backdrop" onClick={close}>
          <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <SafetyCaution {...blocked}>
              <div className="row" style={{ marginTop: 6 }}>
                {!blocked.suspended && (
                  <button className="btn btn-ink" onClick={close} autoFocus>
                    Edit my message
                  </button>
                )}
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    setText("");
                    close();
                  }}
                >
                  {blocked.suspended ? "OK" : "Discard it"}
                </button>
              </div>
            </SafetyCaution>
          </div>
        </div>
      )}
    </div>
  );
}
