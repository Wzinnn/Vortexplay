import type { XtreamCredentials } from "./xtream";

export function parseStoredCredentials(values: Array<string | null | undefined>): XtreamCredentials | null {
  for (const value of values) {
    if (!value) continue;
    try {
      const parsed = JSON.parse(value) as Partial<XtreamCredentials>;
      if (typeof parsed.server !== "string" || !parsed.server.trim()) continue;
      if (typeof parsed.username !== "string" || !parsed.username.trim()) continue;
      if (typeof parsed.password !== "string" || !parsed.password) continue;
      return {
        server: parsed.server.trim(),
        username: parsed.username,
        password: parsed.password,
        ...(parsed.source === "api" || parsed.source === "m3u" ? { source: parsed.source } : {}),
      };
    } catch {
      // Tenta o próximo armazenamento; um valor inválido não deve apagar o fallback.
    }
  }
  return null;
}

export function shouldShowLoginAfterOnboarding(hasCredentials: boolean): boolean {
  return !hasCredentials;
}

export function shouldRestoreStoredLogin(rememberFlag: string | null | undefined): boolean {
  // Legacy installs may not have this flag; keeping the old default preserves
  // compatibility while an explicit "0" means the user opted out.
  return rememberFlag !== "0";
}

export function serializeCredentials(credentials: XtreamCredentials): string {
  return JSON.stringify({
    server: credentials.server,
    username: credentials.username,
    password: credentials.password,
    ...(credentials.source ? { source: credentials.source } : {}),
  });
}
