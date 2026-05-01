const fs = require("node:fs");
const path = require("node:path");
const archiver = require("archiver");
const JSON5 = require("json5");

const {
  FILEBASE,
} = require("../const");

const rootDir = path.resolve(__dirname, "..");
const archetypesPath = path.join(rootDir, "archetypes.json5");
const sourceDatapackDir = path.join(rootDir, "datapack");
const sourceDataDir = path.join(rootDir, "data");
const buildDatapackDir = path.join(rootDir, "build", "test-datapack");
const buildDatapackDataDir = path.join(buildDatapackDir, "data");
const distDir = path.join(rootDir, "dist");
const archiveName = `${FILEBASE}-test.zip`;
const archivePath = path.join(distDir, archiveName);

const TAG_PATH_PARTS = ["tags", "item", "sulfur_cube_archetype"];
const MINECRAFT_NAMESPACE = "minecraft";
const ARCHETYPE_PREFIX = "minecraft:sulfur_cube_archetype";
const FALLBACK_ARCHETYPE = "regular";

function assertDirExists(dirPath, label) {
  if (!fs.existsSync(dirPath)) {
    throw new Error(`${label} was not found: ${dirPath}`);
  }
}

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

  if (!archetype.startsWith(ARCHETYPE_PREFIX)) {
    return archetype;
  }

  const stripped = archetype.slice(ARCHETYPE_PREFIX.length);
  return stripped.startsWith("/") ? stripped.slice(1) : stripped;
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

function groupArchetypeEntries(archetypesRaw) {
  const groupedIds = new Map();

  for (const [rawId, rawArchetype] of Object.entries(archetypesRaw)) {
    if (typeof rawArchetype !== "string") {
      throw new Error(`Invalid archetype for \"${rawId}\": expected a string`);
    }

    const normalizedArchetype = normalizeArchetype(rawArchetype);
    const archetype = normalizedArchetype.length === 0
      ? FALLBACK_ARCHETYPE
      : normalizedArchetype;

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

  return groupedIds;
}

function cloneDatapackStructure() {
  fs.rmSync(buildDatapackDir, { recursive: true, force: true });
  fs.cpSync(sourceDatapackDir, buildDatapackDir, { recursive: true });

  if (fs.existsSync(sourceDataDir)) {
    fs.cpSync(sourceDataDir, buildDatapackDataDir, { recursive: true });
  } else {
    fs.mkdirSync(buildDatapackDataDir, { recursive: true });
  }
}

function writeArchetypeTagFiles(groupedIds) {
  let filesWritten = 0;

  for (const group of groupedIds.values()) {
    const outputDir = path.join(buildDatapackDataDir, group.namespace, ...TAG_PATH_PARTS);
    const outputFilePath = path.join(outputDir, `${group.archetypeName}.json`);
    const values = Array.from(group.ids).sort();

    fs.mkdirSync(path.dirname(outputFilePath), { recursive: true });
    fs.writeFileSync(outputFilePath, `${JSON.stringify({ values }, null, 2)}\n`, "utf8");
    filesWritten += 1;
  }

  return filesWritten;
}

function createZipArchive() {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(distDir, { recursive: true });
    fs.rmSync(archivePath, { force: true });

    const output = fs.createWriteStream(archivePath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", () => resolve(archive.pointer()));
    output.on("error", reject);
    archive.on("error", reject);

    archive.pipe(output);
    archive.directory(buildDatapackDir, false);
    archive.finalize();
  });
}

async function main() {
  assertDirExists(sourceDatapackDir, "datapack directory");

  if (!fs.existsSync(archetypesPath)) {
    throw new Error("archetypes.json5 was not found in the project root");
  }

  const archetypesRaw = readJson(archetypesPath);
  if (!isPlainObject(archetypesRaw)) {
    throw new Error("archetypes.json5 must contain a top-level JSON object");
  }

  const groupedIds = groupArchetypeEntries(archetypesRaw);
  cloneDatapackStructure();
  const filesWritten = writeArchetypeTagFiles(groupedIds);
  const bytesWritten = await createZipArchive();

  console.log(
    `buildTestDatapack complete. Wrote dist/${archiveName} (${bytesWritten} bytes), generated ${filesWritten} tag file(s)`
  );

  const destinationFolder = process.argv[2];
  if (destinationFolder) {
    if (!fs.existsSync(destinationFolder)) {
      throw new Error(`Destination folder does not exist: ${destinationFolder}`);
    }
    const destinationPath = path.join(destinationFolder, archiveName);
    fs.cpSync(archivePath, destinationPath, { force: true });
    console.log(`Copied to ${destinationPath}`);
  }
}

main().catch((error) => {
  console.error(`buildTestDatapack failed: ${error.message}`);
  process.exitCode = 1;
});
