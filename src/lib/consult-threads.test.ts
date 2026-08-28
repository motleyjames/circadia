import { describe, expect, it } from "vitest";
import {
  consultDayLabel,
  consultTitle,
  groupConsultsByDay,
  localDayKeyFromDate,
  parkLiveConsult,
  threadFromLive,
  upsertConsult,
} from "./consult-threads";
import type { ChatMessage, ConsultThread } from "./types";

function msg(role: ChatMessage["role"], text: string, at: string, id: string): ChatMessage {
  return { id, role, text, createdAt: at };
}

describe("consult threads", () => {
  it("titles a thread from the first question and upserts by id", () => {
    const messages = [
      msg("you", "Is melatonin a sleeping pill?", "2026-08-28T16:01:00.000Z", "a"),
      msg("circadia", "Clock signal.", "2026-08-28T16:01:01.000Z", "b"),
    ];
    const thread = threadFromLive(messages, "thread-melatonin-01");
    expect(thread?.title).toBe("Is melatonin a sleeping pill?");
    const next = threadFromLive(
      [...messages, msg("you", "how much?", "2026-08-28T16:02:00.000Z", "c")],
      "thread-melatonin-01",
    )!;
    const history = upsertConsult(upsertConsult([], thread!), next);
    expect(history).toHaveLength(1);
    expect(history[0]?.messages).toHaveLength(3);
  });

  it("parks a live desk into history and leaves the desk empty", () => {
    const messages = [msg("you", "What is Unisom?", "2026-08-27T08:00:00.000Z", "u1")];
    const parked = parkLiveConsult({
      chat: messages,
      activeConsultId: null,
      consultHistory: [],
    });
    expect(parked.chat).toEqual([]);
    expect(parked.activeConsultId).toBeNull();
    expect(parked.consultHistory).toHaveLength(1);
    expect(parked.consultHistory[0]?.title).toBe("What is Unisom?");
  });

  it("groups threads by local day, newest first", () => {
    const now = new Date(2026, 7, 28, 18, 0, 0);
    const todayStamp = new Date(2026, 7, 28, 16, 32, 0).toISOString();
    const yesterdayStamp = new Date(2026, 7, 27, 9, 0, 0).toISOString();
    const olderStamp = new Date(2026, 7, 20, 12, 0, 0).toISOString();
    const olderKey = localDayKeyFromDate(new Date(2026, 7, 20, 12, 0, 0));
    const threads: ConsultThread[] = [
      {
        id: "old-consult-01",
        title: "Older",
        createdAt: olderStamp,
        updatedAt: olderStamp,
        messages: [msg("you", "Older", olderStamp, "o1")],
      },
      {
        id: "today-consult-01",
        title: "Today late",
        createdAt: todayStamp,
        updatedAt: todayStamp,
        messages: [msg("you", "Today late", todayStamp, "t1")],
      },
      {
        id: "yest-consult-01",
        title: "Yesterday",
        createdAt: yesterdayStamp,
        updatedAt: yesterdayStamp,
        messages: [msg("you", "Yesterday", yesterdayStamp, "y1")],
      },
    ];
    const groups = groupConsultsByDay(threads, now);
    expect(groups.map((g) => g.label)).toEqual(["Today", "Yesterday", consultDayLabel(olderKey, now)]);
    expect(groups[0]?.threads[0]?.id).toBe("today-consult-01");
  });

  it("truncates a long first question for the title", () => {
    expect(consultTitle([msg("you", "x".repeat(60), "2026-08-28T00:00:00.000Z", "z")]).length).toBeLessThanOrEqual(48);
  });
});
