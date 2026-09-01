"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { typedWordMatches } from "@/lib/confirm-word";
import { hapticLight } from "@/lib/haptics";
import { cn } from "@/lib/utils";

export { ERASE_CONFIRM_WORD, typedWordMatches } from "@/lib/confirm-word";

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  destructive = false,
  confirmWord,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  confirmWord?: string;
  onConfirm: () => void;
}) {
  const [typed, setTyped] = useState("");
  const needsWord = Boolean(confirmWord);
  const canConfirm = !needsWord || typedWordMatches(typed, confirmWord ?? "");

  function handleOpenChange(next: boolean) {
    if (!next) setTyped("");
    onOpenChange(next);
  }

  function confirm() {
    if (!canConfirm) return;
    onConfirm();
    handleOpenChange(false);
    void hapticLight();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="w-[min(17.5rem,calc(100%-3rem))] overflow-hidden rounded-[14px] border-0 bg-[#1c1c1e] p-0 ring-0 sm:max-w-[17.5rem]"
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            confirm();
          }}
        >
          <DialogHeader className="px-4 pt-5 pb-3 text-center">
            <DialogTitle className="text-[17px] font-semibold text-zinc-50">{title}</DialogTitle>
            <DialogDescription className="text-[13px] leading-relaxed text-zinc-400">
              {description}
            </DialogDescription>
          </DialogHeader>
          {confirmWord ? (
            <label className="block px-4 pb-3">
              <span className="sr-only">Type {confirmWord} to confirm</span>
              <Input
                value={typed}
                onChange={(event) => setTyped(event.currentTarget.value)}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                placeholder={confirmWord}
                className="h-11 rounded-xl border-white/12 bg-white/4 px-3 text-center text-[17px] text-zinc-50"
              />
            </label>
          ) : null}
          <div className="flex border-t border-white/12">
            <DialogClose type="button" className="min-h-11 flex-1 text-[17px] text-sky-300">
              {cancelLabel}
            </DialogClose>
            <Button
              type="submit"
              variant="ghost"
              disabled={!canConfirm}
              className={cn(
                "min-h-11 flex-1 rounded-none border-l border-white/12 bg-transparent text-[17px] font-semibold hover:bg-transparent disabled:opacity-40",
                destructive ? "text-red-400" : "text-sky-300",
              )}
            >
              {confirmLabel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
