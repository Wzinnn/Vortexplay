import { describe, expect, it } from "vitest";
import { parseStoredCredentials, serializeCredentials, shouldRestoreStoredLogin, shouldShowLoginAfterOnboarding } from "./session";

describe("session persistence", () => {
  it("recovers the first valid stored account", () => {
    expect(parseStoredCredentials([
      JSON.stringify({ server: "http://provider.invalid", username: "user", password: "pass" }),
    ])).toEqual({ server: "http://provider.invalid", username: "user", password: "pass" });
  });

  it("falls back to AsyncStorage when SecureStore contains invalid data", () => {
    expect(parseStoredCredentials([
      "{invalid-json",
      JSON.stringify({ server: "http://provider.invalid", username: "user", password: "pass", source: "m3u" }),
    ])).toEqual({ server: "http://provider.invalid", username: "user", password: "pass", source: "m3u" });
  });

  it("does not accept incomplete accounts", () => {
    expect(parseStoredCredentials([
      JSON.stringify({ server: "http://provider.invalid", username: "user" }),
      JSON.stringify({ server: "", username: "user", password: "pass" }),
    ])).toBeNull();
  });

  it("serializes only the session fields", () => {
    expect(serializeCredentials({ server: "http://provider.invalid", username: "user", password: "pass", source: "api" }))
      .toBe(JSON.stringify({ server: "http://provider.invalid", username: "user", password: "pass", source: "api" }));
  });

  it("não reabre o login ao concluir onboarding com sessão restaurada", () => {
    expect(shouldShowLoginAfterOnboarding(true)).toBe(false);
    expect(shouldShowLoginAfterOnboarding(false)).toBe(true);
  });

  it("restaura contas legadas sem flag de preferência", () => {
    expect(shouldRestoreStoredLogin(null)).toBe(true);
    expect(shouldRestoreStoredLogin(undefined)).toBe(true);
    expect(shouldRestoreStoredLogin("1")).toBe(true);
  });

  it("não restaura conta quando o usuário desativou o salvamento", () => {
    expect(shouldRestoreStoredLogin("0")).toBe(false);
  });
});
