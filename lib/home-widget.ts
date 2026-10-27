import { Platform } from "react-native";
import * as Linking from "expo-linking";
import type { Appointment } from "./models";
import { serializeWidgetSchedule } from "./widget-payload";

export async function syncHomeWidget(appointments: Appointment[]): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  try {
    const createCaseUrl = Linking.createURL("/(tabs)/clients", { queryParams: { createCase: "1" } });
    const { default: widget } = await import("expo-mizan-home-widget");
    return await widget.updateToday(serializeWidgetSchedule(appointments, createCaseUrl));
  } catch {
    return false;
  }
}
