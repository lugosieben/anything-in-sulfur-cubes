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

function normalizeObjectEntries(source) {
  const normalized = {};

  for (const [rawKey, rawValue] of Object.entries(source)) {
    const key = normalizeKey(rawKey);
    const value = normalizeValue(rawValue);

    if (!Object.prototype.hasOwnProperty.call(normalized, key)) {
      normalized[key] = value;
    }
  }

  return normalized;
}

function extractKeyFromPropertyPrefix(prefix) {
  const keyMatch = prefix.match(
    /^\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[A-Za-z_$][A-Za-z0-9_$]*)\s*:/,
  );
  if (!keyMatch) {
    return null;
  }

  const rawKeyToken = keyMatch[1];
  if (rawKeyToken.startsWith('"') || rawKeyToken.startsWith("'")) {
    try {
      return JSON5.parse(rawKeyToken);
    } catch {
      return null;
    }
  }

  return rawKeyToken;
}

function findInlineCommentIndex(line) {
  let inString = false;
  let quote = "";
  let escaped = false;

  for (let index = 0; index < line.length - 1; index += 1) {
    const char = line[index];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === "\\") {
        escaped = true;
        continue;
      }

      if (char === quote) {
        inString = false;
        quote = "";
      }

      continue;
    }

    if (char === '"' || char === "'") {
      inString = true;
      quote = char;
      continue;
    }

    if (char === "/" && line[index + 1] === "/") {
      return index;
    }
  }

  return -1;
}

function extractInlineComments(sourceText) {
  const commentsByKey = new Map();

  for (const line of sourceText.split(/\r?\n/)) {
    const commentIndex = findInlineCommentIndex(line);
    if (commentIndex === -1) {
      continue;
    }

    const propertyPrefix = line.slice(0, commentIndex);
    const comment = line.slice(commentIndex).trimEnd();
    const key = extractKeyFromPropertyPrefix(propertyPrefix);

    if (key === null) {
      continue;
    }

    const normalizedKey = normalizeKey(key);
    if (!commentsByKey.has(normalizedKey)) {
      commentsByKey.set(normalizedKey, comment);
    }
  }

  return commentsByKey;
}

function stringifyArchetypes(source, commentsByKey) {
  const lines = ["{"];
  const entries = Object.entries(source);

  for (let index = 0; index < entries.length; index += 1) {
    const [key, value] = entries[index];
    const isLast = index === entries.length - 1;

    let line = `  ${JSON.stringify(key)}: ${JSON.stringify(value)}${isLast ? "" : ","}`;
    const comment = commentsByKey.get(key);
    if (comment) {
      line += ` ${comment}`;
    }

    lines.push(line);
  }

  lines.push("}");
  return `${lines.join("\n")}\n`;
}

function ensureVanillaComment(existingComment) {
  if (existingComment && /\bvanilla\b/i.test(existingComment)) {
    return existingComment;
  }

  if (!existingComment) {
    return "//vanilla";
  }

  return `${existingComment} vanilla`;
}

function sortObjectKeys(source) {
  return Object.fromEntries(
    Object.entries(source).sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey)),
  );
}

function main() {
  if (!fs.existsSync(vanillaPath)) {
    throw new Error("vanilla.json was not found in the project root");
  }

  const vanillaRaw = readJson(vanillaPath);
  if (!isPlainObject(vanillaRaw)) {
    throw new Error("vanilla.json must contain a top-level JSON object");
  }
  const vanilla = normalizeObjectEntries(vanillaRaw);

  let archetypes = {};
  let inlineCommentsByKey = new Map();
  if (fs.existsSync(archetypesPath)) {
    const archetypesText = fs.readFileSync(archetypesPath, "utf8");
    inlineCommentsByKey = extractInlineComments(archetypesText);

    const archetypesRaw = readJson(archetypesPath);
    if (!isPlainObject(archetypesRaw)) {
      throw new Error("archetypes.json5 must contain a top-level JSON object");
    }
    archetypes = normalizeObjectEntries(archetypesRaw);
  }

  let addedCount = 0;
  for (const [key, value] of Object.entries(vanilla)) {
    const hasKey = Object.prototype.hasOwnProperty.call(archetypes, key);
    if (!hasKey) {
      archetypes[key] = value;
      addedCount += 1;
    }

    if (value !== "") {
      archetypes[key] = value;
      const existingComment = inlineCommentsByKey.get(key);
      inlineCommentsByKey.set(key, ensureVanillaComment(existingComment));
    }
  }

  const sortedArchetypes = sortObjectKeys(archetypes);
  const outputText = stringifyArchetypes(sortedArchetypes, inlineCommentsByKey);
  fs.writeFileSync(archetypesPath, outputText, "utf8");
  console.log(`Merge complete. Added ${addedCount} missing key(s) to archetypes.json5`);
}

try {
  main();
} catch (error) {
  console.error(`Merge failed: ${error.message}`);
  process.exitCode = 1;
}