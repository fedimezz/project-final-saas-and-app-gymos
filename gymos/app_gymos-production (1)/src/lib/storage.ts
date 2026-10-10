// Stockage clé-valeur cross-plateforme : SecureStore sur natif, localStorage
// sur web. Nécessaire car le build web d'expo-secure-store (SDK 57) est un
// stub vide et plante sur getValueWithKeyAsync — même API à 3 fonctions,
// donc rien d'autre à changer côté appelants.
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

async function getItemAsync(key: string): Promise<string | null> {
    if (Platform.OS === "web") {
        try {
            return globalThis.localStorage?.getItem(key) ?? null;
        } catch {
            return null;
        }
    }
    return SecureStore.getItemAsync(key);
}

async function setItemAsync(key: string, value: string): Promise<void> {
    if (Platform.OS === "web") {
        try {
            globalThis.localStorage?.setItem(key, value);
        } catch {
            /* stockage web indisponible (navigation privée...) — best-effort, on ignore */
        }
        return;
    }
    // Never migrates to another device via backup/restore.
    await SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
}

async function deleteItemAsync(key: string): Promise<void> {
    if (Platform.OS === "web") {
        try {
            globalThis.localStorage?.removeItem(key);
        } catch {
            /* ignore */
        }
        return;
    }
    await SecureStore.deleteItemAsync(key);
}

export const storage = { getItemAsync, setItemAsync, deleteItemAsync };