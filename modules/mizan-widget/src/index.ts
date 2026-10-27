import { requireNativeModule } from "expo-modules-core";

export type MizanWidgetModule = {
  updateToday(payload: string): Promise<boolean>;
  derivePinHash(pin: string, saltHex: string, rounds: number): Promise<string>;
};

export default requireNativeModule<MizanWidgetModule>("MizanWidget");
