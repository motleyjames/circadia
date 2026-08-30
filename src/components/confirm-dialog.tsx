"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { typedWordMatches } from "@/lib/confirm-word";
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
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="rounded-3xl border border-white/10 bg-[#141022] p-5 sm:max-w-md"
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            confirm();
          }}
        >
          <DialogHeader>
            <DialogTitle className="text-xl text-zinc-50">{title}</DialogTitle>
            <DialogDescription className="text-[14px] leading-relaxed text-zinc-400">
              {description}
            </DialogDescription>
          </DialogHeader>
          {confirmWord ? (
            <label className="mt-4 block">
              <span className="sr-only">Type {confirmWord} to confirm</span>
              <Input
                value={typed}
                onChange={(event) => setTyped(event.currentTarget.value)}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                placeholder={confirmWord}
                className="h-12 rounded-2xl border-white/12 bg-white/4 px-4 text-zinc-50"
              />
            </label>
          ) : null}
          <DialogFooter className="mt-5 flex-col gap-2 sm:flex-row sm:justify-end">
            <DialogClose
              render={
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 rounded-full border-white/15"
                />
              }
            >
              {cancelLabel}
            </DialogClose>
            <Button
              type="submit"
              variant={destructive ? "destructive" : "default"}
              disabled={!canConfirm}
              className={cn(
                "min-h-11 rounded-full",
                !destructive && "bg-zinc-50 text-zinc-950 hover:bg-zinc-200",
              )}
            >
              {confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
