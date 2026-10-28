export function mathQrcodeKey(input: string): string {
  let value = input.trim();
  try {
    value = decodeURIComponent(value);
  } catch {}
  try {
    const parsed = new URL(value);
    const key =
      parsed.searchParams.get("qrcode") ||
      parsed.searchParams.get("id") ||
      parsed.searchParams.get("q");
    if (key && key !== value) return mathQrcodeKey(key);
    const entries = [...parsed.searchParams.values()];
    if (entries.length === 1) return entries[0];
  } catch {}
  return value;
}
