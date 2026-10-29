/// <reference types="node" />
// Test harness: stands in for what Expo/Metro provide at runtime.
(globalThis as unknown as { __DEV__: boolean }).__DEV__ = false; // behave like a release build
process.env.EXPO_PUBLIC_PLATFORM_API_BASE_URL = "https://api.example.com/";
