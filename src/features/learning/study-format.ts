export function today() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" });
}

export const platformLabel = (platform: "math" | "computer") => platform === "math" ? "考研数学" : "计算机 408";
