export function shouldRequireAppLock(
  hasPin: boolean,
  storedPreference: boolean | undefined,
): boolean {
  return !hasPin || storedPreference !== false;
}
