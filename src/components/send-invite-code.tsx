"use client";

import { useState } from "react";
import { inviteSendBody, mailtoHref, smsHref } from "@/lib/console-model";

export function SendInviteCode({ code }: { code: string }) {
  const [mode, setMode] = useState<"idle" | "sms" | "email">("idle");
  const [to, setTo] = useState("");
  const body = inviteSendBody(code);

  async function send() {
    const href = mode === "sms" ? smsHref(to, body) : mailtoHref(to, body);
    try {
      await navigator.clipboard.writeText(body);
    } catch {
      /* still hand the scheme to the shell */
    }
    setTo("");
    setMode("idle");
    window.location.assign(href);
  }

  if (mode === "idle") {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => {
            setTo("");
            setMode("sms");
          }}
          className="min-h-11 cursor-pointer border-0 bg-transparent text-[14px] font-semibold text-op-violet"
        >
          Send by message
        </button>
        <button
          type="button"
          onClick={() => {
            setTo("");
            setMode("email");
          }}
          className="min-h-11 cursor-pointer border-0 bg-transparent text-[14px] font-semibold text-op-violet"
        >
          Send by email
        </button>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
    >
      <label className="text-[13px] font-semibold text-op-ink" htmlFor={`send-${mode}-${code}`}>
        {mode === "sms" ? "Phone number" : "Email address"}
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          id={`send-${mode}-${code}`}
          type={mode === "sms" ? "tel" : "email"}
          value={to}
          autoComplete="off"
          onChange={(event) => setTo(event.target.value)}
          placeholder={mode === "sms" ? "Their number" : "Their address"}
          className="h-11 min-w-[12rem] rounded-lg border border-op-input bg-op-surface px-3 text-[14px] text-op-ink"
        />
        <button
          type="submit"
          className="h-11 cursor-pointer rounded-lg bg-op-violet px-4 text-[14px] font-semibold text-white"
        >
          {mode === "sms" ? "Send by message" : "Send by email"}
        </button>
        <button
          type="button"
          onClick={() => {
            setTo("");
            setMode("idle");
          }}
          className="min-h-11 cursor-pointer border-0 bg-transparent text-[14px] font-semibold text-op-violet"
        >
          Cancel
        </button>
      </div>
      <p className="text-[13px] text-op-muted">The message is also on your clipboard.</p>
    </form>
  );
}
