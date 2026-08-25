import { describe, expect, it } from "vitest";
import {
  beginOfficeBootstrap,
  beginOfficeMount,
  isOfficeBootstrapCurrent,
  isOfficeMountCurrent,
  officeUrl,
  readOfficeLocation,
  shouldBootstrapOfficeSession
} from "../apps/office-web/src/office-shell.js";

describe("Office shell navigation contract", () => {
  it("round-trips a deep-linked operational context without sensitive state", () => {
    const location = readOfficeLocation(
      new URL("https://office.example.test/?module=route-planning&region=pretoria&date=2026-08-24")
    );
    expect(location).toEqual({
      route: "route-planning",
      serviceRegionId: "pretoria",
      serviceDate: "2026-08-24"
    });
    expect(officeUrl(location, "https://office.example.test/?discard=secret")).toBe(
      "/?module=route-planning&region=pretoria&date=2026-08-24"
    );
  });

  it("falls back to Clients for an unknown deep link", () => {
    expect(readOfficeLocation(new URL("https://office.example.test/?module=unknown"))).toEqual({
      route: "clients"
    });
  });

  it("invalidates every prior workspace mount when navigation begins", () => {
    const previous = beginOfficeMount();
    const current = beginOfficeMount();
    expect(isOfficeMountCurrent(previous)).toBe(false);
    expect(isOfficeMountCurrent(current)).toBe(true);
  });

  it("invalidates a stale authentication bootstrap before it can mount a workspace", () => {
    const stale = beginOfficeBootstrap();
    const current = beginOfficeBootstrap();
    expect(isOfficeBootstrapCurrent(stale)).toBe(false);
    expect(isOfficeBootstrapCurrent(current)).toBe(true);
  });

  it("does not remount an established Office shell for routine token renewal", () => {
    expect(shouldBootstrapOfficeSession("TOKEN_REFRESHED", true)).toBe(false);
    expect(shouldBootstrapOfficeSession("SIGNED_IN", true)).toBe(false);
    expect(shouldBootstrapOfficeSession("USER_UPDATED", true)).toBe(false);
    expect(shouldBootstrapOfficeSession("INITIAL_SESSION", false)).toBe(true);
    expect(shouldBootstrapOfficeSession("SIGNED_IN", false)).toBe(true);
  });
});
