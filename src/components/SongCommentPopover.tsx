"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MessageSquare, SendHorizontal, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  addComment,
  getSongComments,
  markCommentsRead,
} from "@/app/actions/votes";
import type { SongComment } from "@/types/models";
import { cn } from "@/lib/utils";

function relTime(ts: number): string {
  const minutes = Math.floor((Date.now() - ts) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

interface SongCommentPopoverProps {
  rehearsalId: string;
  songId: string;
  songTitle: string;
  commentCount: number;
  hasUnread: boolean;
  disabled?: boolean;
  currentUserId: string;
  currentUsername: string;
  /** Parent count adjustments (+1 when I post). */
  onCountChange?: (songId: string, delta: number) => void;
  /** Parent clears the red dot once I've opened the thread. */
  onMarkedRead?: (songId: string) => void;
}

/** Comment button + anchored thread popup with a "New messages" divider. */
export function SongCommentPopover({
  rehearsalId,
  songId,
  songTitle,
  commentCount,
  hasUnread,
  disabled,
  currentUserId,
  currentUsername,
  onCountChange,
  onMarkedRead,
}: SongCommentPopoverProps) {
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<SongComment[]>([]);
  // Divider window, frozen at open: messages newer than my watermark but
  // older than the newest message visible at open = "occurred in my absence".
  // Anything arriving while the chat is open is watched live → never "new".
  const [watermarkAtOpen, setWatermarkAtOpen] = useState<number | null>(null);
  const [latestAtOpen, setLatestAtOpen] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const loadComments = useCallback(async () => {
    const res = await getSongComments(rehearsalId, songId);
    setComments(res.comments);
    return res;
  }, [rehearsalId, songId]);

  // Keep the newest message visible while the thread is open.
  useEffect(() => {
    if (open && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [open, comments.length]);

  // Live-refresh the thread while the popup is open so messages from other
  // members appear (~2s, matching the voting SSE cadence) — no reopen needed.
  // Paused while a send is in flight so the optimistic message never gets
  // clobbered by a fetch that raced ahead of the commit. Each tick also
  // advances my read-watermark: I'm present, so these aren't "unread".
  useEffect(() => {
    if (!open || disabled) return;
    const t = setInterval(() => {
      if (!isSending) {
        loadComments()
          .then(() => markCommentsRead(rehearsalId, songId))
          .catch((err) => console.error("Failed to refresh comments:", err));
      }
    }, 2000);
    return () => clearInterval(t);
  }, [open, disabled, isSending, loadComments, rehearsalId, songId]);

  async function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) return;
    setIsLoading(true);
    try {
      const res = await loadComments();
      setWatermarkAtOpen(res.myLastReadAt);
      setLatestAtOpen(
        res.comments.length ? res.comments[res.comments.length - 1].createdAt : 0
      );
      await markCommentsRead(rehearsalId, songId);
      onMarkedRead?.(songId);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load comments");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSend() {
    const body = draft.trim();
    if (!body || isSending) return;
    setIsSending(true);
    // Optimistic append; rolled back if the server rejects.
    const optimistic: SongComment = {
      id: `optimistic-${Date.now()}`,
      userUuid: currentUserId,
      username: currentUsername,
      body,
      createdAt: Date.now(),
    };
    setComments((prev) => [...prev, optimistic]);
    setDraft("");
    try {
      const res = await addComment(rehearsalId, songId, body);
      if (!res.success) {
        setComments((prev) => prev.filter((c) => c.id !== optimistic.id));
        setDraft(body);
        toast.error(res.error ?? "Failed to send");
      } else {
        onCountChange?.(songId, 1);
        // Reconcile: swap the optimistic entry for the committed row.
        await loadComments();
      }
    } catch (err) {
      console.error(err);
      setComments((prev) => prev.filter((c) => c.id !== optimistic.id));
      setDraft(body);
      toast.error("Failed to send comment");
    } finally {
      setIsSending(false);
    }
  }

  // First message I hadn't seen when I opened the chat → divider above it.
  let dividerIndex = -1;
  if (watermarkAtOpen !== null && latestAtOpen !== null) {
    dividerIndex = comments.findIndex(
      (c) =>
        c.userUuid !== currentUserId &&
        c.createdAt > watermarkAtOpen &&
        c.createdAt <= latestAtOpen
    );
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            disabled={disabled}
            title={disabled ? "Voting ended" : "Comments"}
            className="relative h-8 px-2.5 gap-1.5 rounded-lg border border-border bg-card text-foreground/80 hover:text-primary hover:border-primary/40 hover:bg-primary/5 cursor-pointer"
          />
        }
      >
        <MessageSquare className="w-4 h-4" />
        <span className="text-xs font-bold tabular-nums">{commentCount}</span>
        {/* Suppressed while this very chat is open — messages arriving now
            are watched live, and the watermark advances with each tick. */}
        {hasUnread && !disabled && !open && (
          <span
            className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-red-500 border-2 border-card"
            aria-label="New comments"
          />
        )}
      </PopoverTrigger>

      <PopoverContent className="w-[560px] max-w-[calc(100vw-1.5rem)] p-0">
        <div className="flex flex-col h-[440px]">
          <div className="px-4 py-3 border-b border-border">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Comments
            </p>
            <p className="text-sm font-bold text-foreground truncate mt-0.5">{songTitle}</p>
          </div>

          <div ref={listRef} className="flex-1 overflow-y-auto py-2">
            {isLoading ? (
              <div className="py-10 flex justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : comments.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-12 px-6">
                No comments yet. Start the discussion!
              </p>
            ) : (
              comments.map((comment, i) => (
                <div key={comment.id}>
                  {i === dividerIndex && (
                    <div className="flex items-center gap-2 px-4 py-2 my-1">
                      <span className="h-px flex-1 bg-red-500/40" />
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-red-600 dark:text-red-400">
                        New messages
                      </span>
                      <span className="h-px flex-1 bg-red-500/40" />
                    </div>
                  )}
                  <div className="px-4 py-2 hover:bg-muted/40 transition-colors">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-sm font-bold text-foreground truncate">
                        {comment.username ?? "Unknown"}
                        {comment.userUuid === currentUserId && (
                          <span className="font-medium text-muted-foreground"> (you)</span>
                        )}
                      </p>
                      <span className="text-[11px] text-muted-foreground shrink-0">
                        {relTime(comment.createdAt)}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words mt-0.5 leading-relaxed">
                      {comment.body}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="p-3 border-t border-border flex items-center gap-2">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={disabled ? "Voting ended" : "Write a comment..."}
              disabled={disabled || isSending}
              className="rounded-xl h-10 text-sm flex-1"
            />
            <Button
              size="icon"
              disabled={disabled || isSending || !draft.trim()}
              onClick={handleSend}
              className={cn("shrink-0 size-10 rounded-xl cursor-pointer")}
              title="Send"
            >
              {isSending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <SendHorizontal className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
