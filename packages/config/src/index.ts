export const ENVIRONMENTS = ["local", "staging", "production"] as const;
export type EnvironmentName = (typeof ENVIRONMENTS)[number];

export type ConfigurationValueType = "boolean" | "number" | "string" | "json";
export type ConfigurationValue = boolean | number | string | Readonly<Record<string, unknown>>;

export interface ConfigurationDefinition<TValue extends ConfigurationValue = ConfigurationValue> {
  readonly key: string;
  readonly description: string;
  readonly valueType: ConfigurationValueType;
  readonly required: boolean;
  readonly defaultValue?: TValue;
  readonly validate?: (value: TValue) => boolean;
}

const CONFIGURATION_KEY_PATTERN = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
const SECRET_KEY_PATTERN = /(?:^|[._-])(api[-_]?key|credential|password|secret|token)(?:$|[._-])/i;

export function validateConfigurationValue<TValue extends ConfigurationValue>(
  definition: ConfigurationDefinition<TValue>,
  value: TValue
): void {
  const actualType =
    typeof value === "object" && value !== null && !Array.isArray(value) ? "json" : typeof value;

  if (actualType !== definition.valueType) {
    throw new TypeError(`${definition.key} must be a ${definition.valueType} value.`);
  }

  if (definition.validate && !definition.validate(value)) {
    throw new RangeError(`${definition.key} failed configuration validation.`);
  }
}

export function defineConfiguration<TValue extends ConfigurationValue>(
  definition: ConfigurationDefinition<TValue>
): ConfigurationDefinition<TValue> {
  if (!CONFIGURATION_KEY_PATTERN.test(definition.key)) {
    throw new TypeError(
      "Configuration keys must use lowercase dot, dash, or alphanumeric segments."
    );
  }

  if (SECRET_KEY_PATTERN.test(definition.key)) {
    throw new TypeError(
      "Secrets must be stored in an environment secret store, not configuration."
    );
  }

  if (definition.defaultValue !== undefined) {
    validateConfigurationValue(definition, definition.defaultValue);
  }

  return Object.freeze({ ...definition });
}

export function resolveConfiguration<TValue extends ConfigurationValue>(
  definition: ConfigurationDefinition<TValue>,
  environmentValue?: TValue
): TValue | undefined {
  const value = environmentValue ?? definition.defaultValue;
  if (value === undefined) {
    if (definition.required) {
      throw new Error(`Required configuration ${definition.key} has no value.`);
    }
    return undefined;
  }

  validateConfigurationValue(definition, value);
  return value;
}

export interface FeatureFlagContext {
  readonly environment: EnvironmentName;
  readonly roleId?: string;
  readonly serviceRegionId?: string;
  readonly teamId?: string;
}

export interface FeatureFlagTarget {
  readonly environment: EnvironmentName;
  readonly enabled: boolean;
  readonly roleId?: string;
  readonly serviceRegionId?: string;
  readonly teamId?: string;
}

export interface FeatureFlagDefinition {
  readonly key: string;
  readonly defaultEnabled: boolean;
  readonly targets: readonly FeatureFlagTarget[];
}

export function evaluateFeatureFlag(
  flag: FeatureFlagDefinition,
  context: FeatureFlagContext
): boolean {
  const matches = flag.targets.filter(
    (target) =>
      target.environment === context.environment &&
      (target.roleId === undefined || target.roleId === context.roleId) &&
      (target.serviceRegionId === undefined ||
        target.serviceRegionId === context.serviceRegionId) &&
      (target.teamId === undefined || target.teamId === context.teamId)
  );

  if (matches.length === 0) return flag.defaultEnabled;

  const specificity = (target: FeatureFlagTarget): number =>
    Number(target.roleId !== undefined) +
    Number(target.serviceRegionId !== undefined) +
    Number(target.teamId !== undefined);
  const highestSpecificity = Math.max(...matches.map(specificity));
  const mostSpecific = matches.filter((target) => specificity(target) === highestSpecificity);

  return mostSpecific.every((target) => target.enabled);
}
