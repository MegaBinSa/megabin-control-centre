import { defineConfiguration, resolveConfiguration, type EnvironmentName } from "@megabin/config";

import type { RuntimeConfiguration, RuntimeDatabase } from "./contracts.js";

const proofEnabled = defineConfiguration<boolean>({
  key: "runtime.proof-enabled",
  description: "Enables the removable synthetic runtime proof endpoint.",
  valueType: "boolean",
  required: true
});

const dispatcherBatchSize = defineConfiguration<number>({
  key: "runtime.dispatcher-batch-size",
  description: "Maximum events claimed by one bounded dispatcher run.",
  valueType: "number",
  required: true,
  defaultValue: 10,
  validate: (value) => Number.isInteger(value) && value >= 1 && value <= 100
});

const dispatcherMaxAttempts = defineConfiguration<number>({
  key: "runtime.dispatcher-max-attempts",
  description: "Maximum synthetic dispatch attempts before dead-letter.",
  valueType: "number",
  required: true,
  defaultValue: 3,
  validate: (value) => Number.isInteger(value) && value >= 1 && value <= 10
});

export async function loadRuntimeConfiguration(
  database: RuntimeDatabase,
  environment: EnvironmentName
): Promise<RuntimeConfiguration> {
  const values = await database.loadRuntimeConfiguration(environment);
  return {
    proofEnabled: required(
      resolveConfiguration(proofEnabled, values[proofEnabled.key] as boolean | undefined),
      proofEnabled.key
    ),
    dispatcherBatchSize: required(
      resolveConfiguration(
        dispatcherBatchSize,
        values[dispatcherBatchSize.key] as number | undefined
      ),
      dispatcherBatchSize.key
    ),
    dispatcherMaxAttempts: required(
      resolveConfiguration(
        dispatcherMaxAttempts,
        values[dispatcherMaxAttempts.key] as number | undefined
      ),
      dispatcherMaxAttempts.key
    )
  };
}

function required<TValue>(value: TValue | undefined, key: string): TValue {
  if (value === undefined) throw new Error(`Required configuration ${key} has no value.`);
  return value;
}

export const RUNTIME_CONFIGURATION_KEYS = [
  proofEnabled.key,
  dispatcherBatchSize.key,
  dispatcherMaxAttempts.key
] as const;
