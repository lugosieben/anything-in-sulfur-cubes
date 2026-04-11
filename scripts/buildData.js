const fs = require("node:fs");
const path = require("node:path");
const JSON5 = require("json5");

const rootDir = path.resolve(__dirname, "..");
const archetypesPath = path.join(rootDir, "archetypes.json5");
const sourceDataRoot = path.join(rootDir, "data");
const outputDataRoot = path.join(rootDir, "build", "data");
const TAG_PATH_PARTS = ["tags", "item", "sulfur_cube_archetype"];
const MINECRAFT_NAMESPACE = "minecraft";
const ARCHETYPE_PREFIX = "minecraft:sulfur_cube_archetype/";

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON5.parse(raw);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeId(id) {
  return id.includes(":") ? id : `${MINECRAFT_NAMESPACE}:${id}`;
}

function normalizeArchetype(rawArchetype) {
  const archetype = rawArchetype.trim();

  if (archetype.startsWith(ARCHETYPE_PREFIX)) {
    return archetype.slice(ARCHETYPE_PREFIX.length);
  }

  return archetype;
}

function splitArchetype(archetype) {
  const separatorIndex = archetype.indexOf(":");

  if (separatorIndex === -1) {
    return {
      namespace: MINECRAFT_NAMESPACE,
      archetypeName: archetype,
    };
  }

  return {
    namespace: archetype.slice(0, separatorIndex) || MINECRAFT_NAMESPACE,
    archetypeName: archetype.slice(separatorIndex + 1),
  };
}

function main() {
  if (!fs.existsSync(archetypesPath)) {
    throw new Error("archetypes.json5 was not found in the project root");
  }

  const archetypesRaw = readJson(archetypesPath);
  if (!isPlainObject(archetypesRaw)) {
    throw new Error("archetypes.json5 must contain a top-level JSON object");
  }

  const groupedIds = new Map();

  for (const [rawId, rawArchetype] of Object.entries(archetypesRaw)) {
    if (typeof rawArchetype !== "string") {
      throw new Error(`Invalid archetype for \"${rawId}\": expected a string`);
    }

    const archetype = normalizeArchetype(rawArchetype);
    if (archetype.length === 0) {
      continue;
    }

    const { namespace, archetypeName } = splitArchetype(archetype);
    if (!archetypeName) {
      throw new Error(`Invalid archetype for \"${rawId}\": missing archetype name`);
    }

    const mapKey = `${namespace}:${archetypeName}`;
    if (!groupedIds.has(mapKey)) {
      groupedIds.set(mapKey, {
        namespace,
        archetypeName,
        ids: new Set(),
      });
    }

    groupedIds.get(mapKey).ids.add(normalizeId(rawId));
  }

  fs.rmSync(outputDataRoot, { recursive: true, force: true });
  if (fs.existsSync(sourceDataRoot)) {
    fs.cpSync(sourceDataRoot, outputDataRoot, { recursive: true });
  }

  let filesWritten = 0;
  for (const group of groupedIds.values()) {
    const outputDir = path.join(outputDataRoot, group.namespace, ...TAG_PATH_PARTS);
    const outputFilePath = path.join(outputDir, `${group.archetypeName}.json`);
    const values = Array.from(group.ids).sort();

    fs.mkdirSync(path.dirname(outputFilePath), { recursive: true });
    fs.writeFileSync(outputFilePath, `${JSON.stringify({ values }, null, 2)}\n`, "utf8");
    filesWritten += 1;
  }

  console.log(`buildData complete. Wrote ${filesWritten} file(s) under build/data`);
}

try {
  main();
} catch (error) {
  console.error(`buildData failed: ${error.message}`);
  process.exitCode = 1;
}
