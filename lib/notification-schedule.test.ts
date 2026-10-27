import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Appointment } from "./models";

const notifications = vi.hoisted(() => ({
  getPermissionsAsync: vi.fn(),
  requestPermissionsAsync: vi.fn(),
  scheduleNotificationAsync: vi.fn(),
  cancelScheduledNotificationAsync: vi.fn(),
}));

vi.mock("react-native", () => ({ Platform: { OS: "android" } }));
vi.mock("expo-notifications", () => ({
  ...notifications,
  SchedulableTriggerInputTypes: { DATE: "date" },
}));
vi.mock("./notification-copy", () => ({
  appointmentReminderMessage: () => ({ title: "تذكير", body: "موعد قريب" }),
}));

import { prepareAppointmentReminderUpdate } from "./notifications";

function makeAppointment(id: string): Appointment {
  const date = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
  return {
    id,
    title: "جلسة",
    kind: "hearing",
    date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
    time: "12:00",
    location: "",
    reminders: [`old-${id}`],
  };
}

describe("transactional appointment reminder changes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    notifications.getPermissionsAsync.mockResolvedValue({ granted: true });
    notifications.requestPermissionsAsync.mockResolvedValue({ granted: true });
    notifications.cancelScheduledNotificationAsync.mockResolvedValue(undefined);
  });

  it("keeps existing IDs alongside replacements until the caller commits", async () => {
    let sequence = 0;
    notifications.scheduleNotificationAsync.mockImplementation(async () => `new-${++sequence}`);
    const original = makeAppointment("case-a");

    const prepared = await prepareAppointmentReminderUpdate([original], {});

    expect(prepared.enabled).toBe(true);
    expect(prepared.oldIds).toEqual(["old-case-a"]);
    expect(prepared.newIds).toEqual(["new-1", "new-2"]);
    expect(prepared.appointments[0]?.reminders).toEqual(["new-1", "new-2", "old-case-a"]);
    expect(notifications.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
  });

  it("leaves stored reminders unchanged when notification permission is denied", async () => {
    notifications.getPermissionsAsync.mockResolvedValue({ granted: false });
    notifications.requestPermissionsAsync.mockResolvedValue({ granted: false });
    const original = makeAppointment("case-b");

    const prepared = await prepareAppointmentReminderUpdate([original], {});

    expect(prepared.enabled).toBe(false);
    expect(prepared.appointments[0]?.reminders).toEqual(["old-case-b"]);
    expect(prepared.orphanIds).toEqual([]);
    expect(notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it("retains the ID of a replacement that could not be rolled back", async () => {
    let permissionCheck = 0;
    let sequence = 0;
    notifications.getPermissionsAsync.mockImplementation(async () => ({ granted: ++permissionCheck === 1 }));
    notifications.requestPermissionsAsync.mockResolvedValue({ granted: false });
    notifications.scheduleNotificationAsync.mockImplementation(async () => `new-${++sequence}`);
    notifications.cancelScheduledNotificationAsync.mockImplementation(async (id: string) => {
      if (id === "new-1") throw new Error("temporary cancellation failure");
    });

    const prepared = await prepareAppointmentReminderUpdate([makeAppointment("a"), makeAppointment("b")], {});

    expect(prepared.enabled).toBe(false);
    expect(prepared.orphanIds).toEqual(["new-1"]);
    expect(prepared.appointments[0]?.reminders).toEqual(["old-a", "new-1"]);
    expect(prepared.appointments[1]?.reminders).toEqual(["old-b"]);
  });

  it("rolls back scheduled replacements when a later scheduling operation fails", async () => {
    let sequence = 0;
    notifications.scheduleNotificationAsync.mockImplementation(async () => {
      sequence += 1;
      if (sequence === 4) throw new Error("schedule failure");
      return `new-${sequence}`;
    });

    const prepared = await prepareAppointmentReminderUpdate([makeAppointment("a"), makeAppointment("b")], {});

    expect(prepared.enabled).toBe(false);
    expect(prepared.reason).toBe("schedule");
    expect(notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith("new-3");
    expect(notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith("new-1");
    expect(notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith("new-2");
  });
});
