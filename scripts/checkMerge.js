const fs = require("node:fs");
const path = require("node:path");
const JSON5 = require("json5");

const rootDir = path.resolve(__dirname, "..");
const vanillaPath = path.join(rootDir, "vanilla.json");
const archetypesPath = path.join(rootDir, "archetypes.json5");
const KEY_PREFIX = "minecraft:";
const ARCHETYPE_PREFIX = "minecraft:sulfur_cube_archetype";

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON5.parse(raw);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeKey(key) {
  if (key.startsWith(KEY_PREFIX)) {
    return key.slice(KEY_PREFIX.length);
  }
  return key;
}

function normalizeValue(value) {
  if (!value.startsWith(ARCHETYPE_PREFIX)) {
    return value;
  }

  const stripped = value.slice(ARCHETYPE_PREFIX.length);
  return stripped.startsWith("/") ? stripped.slice(1) : stripped;
}

function collectNormalizedEntries(source, sourceName) {
  const normalized = {};
  const issues = [];
  const firstRawKeyByNormalizedKey = new Map();

  for (const [rawKey, rawValue] of Object.entries(source)) {
    if (typeof rawValue !== "string") {
      issues.push(
        `${sourceName} key "${rawKey}" must map to a string value, got ${typeof rawValue}`,
      );
      continue;
    }

    const normalizedKey = normalizeKey(rawKey);
    const normalizedValue = normalizeValue(rawValue);

    if (firstRawKeyByNormalizedKey.has(normalizedKey)) {
      issues.push(
        `${sourceName} contains duplicate normalized key "${normalizedKey}" via "${firstRawKeyByNormalizedKey.get(normalizedKey)}" and "${rawKey}"`,
      );
      continue;
    }

    firstRawKeyByNormalizedKey.set(normalizedKey, rawKey);
    normalized[normalizedKey] = normalizedValue;
  }

  return {
    normalized,
    issues,
  };
}

function checkArchetypesCanonicalForm(archetypesRaw) {
  const issues = [];

  for (const [rawKey, rawValue] of Object.entries(archetypesRaw)) {
    if (typeof rawValue !== "string") {
      continue;
    }

    const normalizedKey = normalizeKey(rawKey);
    if (rawKey !== normalizedKey) {
      issues.push(
        `archetypes.json5 key "${rawKey}" should be "${normalizedKey}" (merge removes the "${KEY_PREFIX}" prefix)`,
      );
    }

    const normalizedValue = normalizeValue(rawValue);
    if (rawValue !== normalizedValue) {
      issues.push(
        `archetypes.json5 value for "${rawKey}" should be "${normalizedValue}" (merge removes the "${ARCHETYPE_PREFIX}/" prefix)`,
      );
    }
  }

  const seen = new Set();
  const normalizedKeysInFileOrder = [];
  for (const rawKey of Object.keys(archetypesRaw)) {
    const normalizedKey = normalizeKey(rawKey);
    if (seen.has(normalizedKey)) {
      continue;
    }

    seen.add(normalizedKey);
    normalizedKeysInFileOrder.push(normalizedKey);
  }

  const sortedKeys = [...normalizedKeysInFileOrder].sort((left, right) =>
    left.localeCompare(right),
  );
  for (let index = 0; index < normalizedKeysInFileOrder.length; index += 1) {
    if (normalizedKeysInFileOrder[index] !== sortedKeys[index]) {
      issues.push(
        `archetypes.json5 is not sorted by key; expected "${sortedKeys[index]}" at position ${index + 1} but found "${normalizedKeysInFileOrder[index]}"`,
      );
      break;
    }
  }

  return issues;
}

function checkVanillaPresenceAndOverrides(vanilla, archetypes) {
  const issues = [];

  for (const [key, vanillaValue] of Object.entries(vanilla)) {
    const hasKey = Object.prototype.hasOwnProperty.call(archetypes, key);
    if (!hasKey) {
      issues.push(`archetypes.json5 is missing key "${key}" required by vanilla.json`);
      continue;
    }

    if (vanillaValue !== "" && archetypes[key] !== vanillaValue) {
      issues.push(
        `value mismatch for "${key}": vanilla.json requires "${vanillaValue}", archetypes.json5 has "${archetypes[key]}"`,
      );
    }
  }

  return issues;
}

function formatIssues(issues, maxShown = 40) {
  const shown = issues.slice(0, maxShown).map((issue) => `- ${issue}`);
  const omittedCount = issues.length - shown.length;
  if (omittedCount > 0) {
    shown.push(`- ... ${omittedCount} more issue(s) omitted`);
  }
  return shown.join("\n");
}

function main() {
  if (!fs.existsSync(vanillaPath)) {
    throw new Error("vanilla.json was not found in the project root");
  }

  if (!fs.existsSync(archetypesPath)) {
    throw new Error("archetypes.json5 was not found in the project root");
  }

  const vanillaRaw = readJson(vanillaPath);
  if (!isPlainObject(vanillaRaw)) {
    throw new Error("vanilla.json must contain a top-level JSON object");
  }

  const archetypesRaw = readJson(archetypesPath);
  if (!isPlainObject(archetypesRaw)) {
    throw new Error("archetypes.json5 must contain a top-level JSON object");
  }

  const {
    normalized: vanilla,
    issues: vanillaNormalizationIssues,
  } = collectNormalizedEntries(vanillaRaw, "vanilla.json");
  const {
    normalized: archetypes,
    issues: archetypesNormalizationIssues,
  } = collectNormalizedEntries(archetypesRaw, "archetypes.json5");

  const issues = [
    ...vanillaNormalizationIssues,
    ...archetypesNormalizationIssues,
    ...checkArchetypesCanonicalForm(archetypesRaw),
    ...checkVanillaPresenceAndOverrides(vanilla, archetypes),
  ];

  if (issues.length > 0) {
    throw new Error(`checkMerge found ${issues.length} issue(s):\n${formatIssues(issues)}`);
  }

  console.log("checkMerge passed");
}

try {
  main();
} catch (error) {
  console.error(`checkMerge failed: ${error.message}`);
  process.exitCode = 1;
}
