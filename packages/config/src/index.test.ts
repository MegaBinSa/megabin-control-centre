import { describe, expect, it } from "vitest";

import { defineConfiguration, evaluateFeatureFlag, resolveConfiguration } from "./index.js";

describe("configuration registry", () => {
  it("resolves and validates an environment value", () => {
    const definition = defineConfiguration<number>({
      key: "jobs.max-attempts",
      description: "Maximum attempts",
      valueType: "number",
      required: true,
      defaultValue: 3,
      validate: (value) => value >= 1 && value <= 10
    });

    expect(resolveConfiguration(definition, 5)).toBe(5);
    expect(() => resolveConfiguration(definition, 20)).toThrow("failed configuration validation");
  });

  it("rejects a default with the wrong type", () => {
    expect(() =>
      defineConfiguration({
        key: "jobs.enabled",
        description: "Enable jobs",
        valueType: "boolean",
        required: true,
        defaultValue: "yes"
      })
    ).toThrow("must be a boolean");
  });

  it("prevents secrets from being registered as ordinary configuration", () => {
    expect(() =>
      defineConfiguration({
        key: "mapping.api-key",
        description: "Unsafe secret",
        valueType: "string",
        required: true
      })
    ).toThrow("Secrets must be stored");
  });
});

describe("feature flags", () => {
  const flag = {
    key: "platform.proof",
    defaultEnabled: false,
    targets: [
      { environment: "staging", enabled: true },
      { environment: "staging", roleId: "restricted-role", enabled: false }
    ]
  } as const;

  it("uses the safe default when no target matches", () => {
    expect(evaluateFeatureFlag(flag, { environment: "production" })).toBe(false);
  });

  it("uses the most specific target and lets disabled win ties", () => {
    expect(evaluateFeatureFlag(flag, { environment: "staging" })).toBe(true);
    expect(evaluateFeatureFlag(flag, { environment: "staging", roleId: "restricted-role" })).toBe(
      false
    );
  });
});
