import { isPhoneNative } from "@/lib/phone-native";

/**
 * Taptic Engine feedback. No-ops in the browser, tests, and until
 * `npx cap sync ios` has installed @capacitor/haptics on the phone.
 * Never throws into the diary.
 */
export async function hapticSelect(): Promise<void> {
  if (!isPhoneNative()) return;
  try {
    const { Haptics } = await import("@capacitor/haptics");
    await Haptics.selectionChanged();
  } catch {
    /* plugin missing or web preview */
  }
}

export async function hapticLight(): Promise<void> {
  if (!isPhoneNative()) return;
  try {
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch {
    /* plugin missing or web preview */
  }
}
