import { Alert, Platform } from "react-native";

export function confirmDestructiveAction(title: string, message: string, actionLabel = "حذف"): Promise<boolean> {
  if (Platform.OS === "web") {
    return Promise.resolve(typeof window !== "undefined" && window.confirm(`${title}\n\n${message}`));
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = (answer: boolean) => {
      if (settled) return;
      settled = true;
      resolve(answer);
    };
    Alert.alert(title, message, [
      { text: "إلغاء", style: "cancel", onPress: () => finish(false) },
      { text: actionLabel, style: "destructive", onPress: () => finish(true) },
    ], { cancelable: true, onDismiss: () => finish(false) });
  });
}
