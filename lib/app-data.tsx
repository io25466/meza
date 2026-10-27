import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import {
  changeVaultPin,
  createVaultPin,
  getBiometricPreference,
  hasVaultPin,
  readVault,
  getAppLockPreference,
  setAppLockPreference,
  setBiometricPreference,
  verifyVaultPin,
  writeVault,
} from "./secure-vault";
import { EMPTY_DATA, normalizeAppData, type AppData } from "./models";
import { syncHomeWidget } from "./home-widget";

type AppDataContextValue = {
  data: AppData;
  ready: boolean;
  dataReady: boolean;
  lockEnabled: boolean;
  needsSetup: boolean;
  locked: boolean;
  biometricAvailable: boolean;
  biometricEnabled: boolean;
  updateData: (updater: (current: AppData) => AppData) => Promise<void>;
  replaceAllData: (next: AppData) => Promise<void>;
  setPin: (pin: string) => Promise<void>;
  changePin: (currentPin: string, nextPin: string) => Promise<void>;
  setBiometricEnabled: (enabled: boolean) => Promise<void>;
  setAppLockEnabled: (enabled: boolean, currentPin?: string) => Promise<void>;
  unlock: (pin: string) => Promise<boolean>;
  unlockBiometric: () => Promise<boolean>;
  lock: () => void;
};

const AppDataContext = createContext<AppDataContextValue | null>(null);

export function AppDataProvider({ children }: React.PropsWithChildren) {
  const [data, setData] = useState<AppData>(EMPTY_DATA);
  const dataRef = useRef<AppData>(EMPTY_DATA);
  const writeQueue = useRef<Promise<void>>(Promise.resolve());
  const [ready, setReady] = useState(false);
  const [dataReady, setDataReady] = useState(false);
  const [lockEnabled, setLockEnabledState] = useState(true);
  const hydrationPromise = useRef<Promise<void> | null>(null);
  const dataReadyRef = useRef(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [locked, setLocked] = useState(Platform.OS !== "web");
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabledState] = useState(false);

  const hydrateVault = useCallback(async () => {
    if (dataReadyRef.current) return;
    if (hydrationPromise.current) return hydrationPromise.current;
    const operation = (async () => {
      const loaded = await readVault();
      dataRef.current = loaded;
      setData(loaded);
      dataReadyRef.current = true;
      setDataReady(true);
    })();
    hydrationPromise.current = operation;
    try { await operation; }
    finally { if (hydrationPromise.current === operation) hydrationPromise.current = null; }
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        if (Platform.OS === "web") {
          const loaded = await readVault();
          if (!active) return;
          dataRef.current = loaded; setData(loaded); dataReadyRef.current = true; setDataReady(true);
          setNeedsSetup(false); setLocked(false); setReady(true);
          return;
        }
        const [configured, enabled] = await Promise.all([hasVaultPin(), getAppLockPreference()]);
        if (!active) return;
        setNeedsSetup(!configured);
        setLockEnabledState(enabled);
        setLocked(!configured || enabled);
        setReady(true);
        void Promise.all([
          LocalAuthentication.hasHardwareAsync(),
          LocalAuthentication.isEnrolledAsync(),
          getBiometricPreference(),
        ]).then(([hardware, enrolled, preference]) => {
          if (active) {
            setBiometricAvailable(hardware && enrolled);
            setBiometricEnabledState(hardware && enrolled && preference);
          }
        }).catch(() => undefined);
        if (configured && !enabled) {
          setLocked(false);
          void hydrateVault().catch(() => { if (active) setLocked(true); });
        }
      } catch {
        if (active) { setNeedsSetup(true); setReady(true); setLocked(true); }
      }
    })();
    return () => { active = false; };
  }, [hydrateVault]);

  useEffect(() => {
    if (!dataReady || Platform.OS !== "android") return;
    void syncHomeWidget(data.appointments);
  }, [data.appointments, dataReady]);

  useEffect(() => {
    if (Platform.OS === "web" || !lockEnabled) return;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") setLocked(true);
    });
    return () => subscription.remove();
  }, [lockEnabled]);

  const updateData = useCallback((updater: (current: AppData) => AppData) => {
    const operation = writeQueue.current.then(async () => {
      const next = updater(dataRef.current);
      await writeVault(next);
      dataRef.current = next;
      setData(next);
    });
    writeQueue.current = operation.catch(() => undefined);
    return operation;
  }, []);

  const replaceAllData = useCallback((nextData: AppData) => {
    const operation = writeQueue.current.then(async () => {
      const next = normalizeAppData(nextData);
      await writeVault(next);
      dataRef.current = next;
      setData(next);
    });
    writeQueue.current = operation.catch(() => undefined);
    return operation;
  }, []);

  const setPin = useCallback(async (pin: string) => {
    await createVaultPin(pin);
    await setAppLockPreference(true);
    setLockEnabledState(true);
    setNeedsSetup(false);
    await hydrateVault();
    setLocked(false);
  }, [hydrateVault]);

  const changePin = useCallback(async (currentPin: string, nextPin: string) => {
    await changeVaultPin(currentPin, nextPin);
  }, []);

  const setBiometricEnabled = useCallback(async (enabled: boolean) => {
    if (enabled && !biometricAvailable) throw new Error("سجّل بصمة أو وسيلة مصادقة على الجهاز أولاً");
    await setBiometricPreference(enabled);
    setBiometricEnabledState(enabled);
  }, [biometricAvailable]);

  const setAppLockEnabled = useCallback(async (enabled: boolean, currentPin?: string) => {
    if (Platform.OS === "web") throw new Error("قفل التطبيق متاح في نسخة الهاتف فقط");
    if (!enabled) {
      if (!currentPin || !(await verifyVaultPin(currentPin))) throw new Error("رمز PIN الحالي غير صحيح");
    } else if (!(await hasVaultPin())) {
      throw new Error("اضبط رمز PIN أولاً قبل تفعيل القفل");
    }
    await setAppLockPreference(enabled);
    setLockEnabledState(enabled);
    setLocked(enabled);
  }, []);

  const unlock = useCallback(async (pin: string) => {
    const valid = await verifyVaultPin(pin);
    if (!valid) return false;
    setLocked(false);
    try { await hydrateVault(); }
    catch { setLocked(true); return false; }
    return true;
  }, [hydrateVault]);

  const unlockBiometric = useCallback(async () => {
    if (!biometricAvailable || !biometricEnabled) return false;
    const result = await LocalAuthentication.authenticateAsync({ promptMessage: "فتح خزنة ميزان", cancelLabel: "استخدام الرمز", fallbackLabel: "استخدام الرمز" });
    if (!result.success) return false;
    setLocked(false);
    try { await hydrateVault(); }
    catch { setLocked(true); return false; }
    return true;
  }, [biometricAvailable, biometricEnabled, hydrateVault]);

  const lock = useCallback(() => {
    if (Platform.OS !== "web" && lockEnabled) setLocked(true);
  }, [lockEnabled]);

  const value = useMemo(() => ({
    data, ready, dataReady, lockEnabled, needsSetup, locked, biometricAvailable, biometricEnabled,
    updateData, replaceAllData, setPin, changePin, setBiometricEnabled, setAppLockEnabled, unlock, unlockBiometric, lock,
  }), [data, ready, dataReady, lockEnabled, needsSetup, locked, biometricAvailable, biometricEnabled, updateData, replaceAllData, setPin, changePin, setBiometricEnabled, setAppLockEnabled, unlock, unlockBiometric, lock]);

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData(): AppDataContextValue {
  const context = useContext(AppDataContext);
  if (!context) throw new Error("useAppData must be used inside AppDataProvider");
  return context;
}
