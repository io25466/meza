import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform } from "react-native";

export function KeyboardAvoidingSheet({ children, fill = false }: { children: ReactNode; fill?: boolean }) {
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      style={{ flex: 1, justifyContent: fill ? "flex-start" : "flex-end", backgroundColor: "#0007" }}
    >
      {children}
    </KeyboardAvoidingView>
  );
}
