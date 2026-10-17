// ArrayBuffer → base64, in chunks (String.fromCharCode.apply on a multi-MB
// array overflows the call stack). Used to hand a club's custom 3D model to the
// WebView viewer. Hermes provides the global btoa.
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK) as unknown as number[]);
  }
  return btoa(binary);
}
