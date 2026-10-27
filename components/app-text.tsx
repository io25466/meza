import { createContext, useContext } from "react";
import { Text as NativeText, StyleSheet, type TextProps, type TextStyle } from "react-native";

export const ArabicFontLoadedContext = createContext(false);

const FONT_REGULAR = "Cairo_400Regular";
const FONT_MEDIUM = "Cairo_500Medium";
const FONT_BOLD = "Cairo_700Bold";

export function useArabicFontFamily(weight: "regular" | "medium" | "bold" = "regular") {
  const loaded = useContext(ArabicFontLoadedContext);
  if (!loaded) return undefined;
  return weight === "bold" ? FONT_BOLD : weight === "medium" ? FONT_MEDIUM : FONT_REGULAR;
}

export function AppText({ style, ...props }: TextProps) {
  const fontLoaded = useContext(ArabicFontLoadedContext);
  const flattened = StyleSheet.flatten(style) as TextStyle | undefined;
  const weight = Number(flattened?.fontWeight ?? 400);
  const family = fontLoaded ? (weight >= 600 ? FONT_BOLD : weight >= 500 ? FONT_MEDIUM : FONT_REGULAR) : undefined;
  return <NativeText {...props} style={[family ? { fontFamily: family } : undefined, style]} />;
}
