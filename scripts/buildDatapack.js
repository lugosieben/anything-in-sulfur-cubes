const fs = require("node:fs");
const path = require("node:path");
const archiver = require("archiver");

const {
  FILEBASE,
} = require("../const");

const rootDir = path.resolve(__dirname, "..");
const sourceDatapackDir = path.join(rootDir, "datapack");
const sourceDataDir = path.join(rootDir, "build", "data");
const buildDatapackDir = path.join(rootDir, "build", "datapack");
const buildDatapackDataDir = path.join(buildDatapackDir, "data");
const distDir = path.join(rootDir, "dist");
const archiveName = `${FILEBASE}.zip`;
const archivePath = path.join(distDir, archiveName);

function assertDirExists(dirPath, label) {
  if (!fs.existsSync(dirPath)) {
    throw new Error(`${label} was not found: ${dirPath}`);
  }
}

function cloneDatapackStructure() {
  fs.rmSync(buildDatapackDir, { recursive: true, force: true });
  fs.cpSync(sourceDatapackDir, buildDatapackDir, { recursive: true });
  fs.cpSync(sourceDataDir, buildDatapackDataDir, { recursive: true });
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
  assertDirExists(sourceDataDir, "build data directory");

  cloneDatapackStructure();
  const bytesWritten = await createZipArchive();

  console.log(
    `buildDatapack complete. Wrote dist/${archiveName} (${bytesWritten} bytes)`
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
  console.error(`buildDatapack failed: ${error.message}`);
  process.exitCode = 1;
});
