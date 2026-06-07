const fs = require("node:fs");
const path = require("node:path");
const archiver = require("archiver");

const {
  RESOURCEPACKBASE,
} = require("../const");

const rootDir = path.resolve(__dirname, "..");
const sourceResourcePackDir = path.join(rootDir, "resourcepack");
const buildIgnorePath = path.join(sourceResourcePackDir, ".buildignore");
const distDir = path.join(rootDir, "dist");
const archiveName = `${RESOURCEPACKBASE}.zip`;
const archivePath = path.join(distDir, archiveName);

function assertDirExists(dirPath, label) {
  if (!fs.existsSync(dirPath)) {
    throw new Error(`${label} was not found: ${dirPath}`);
  }
}

function isSamePath(leftPath, rightPath) {
  const resolvedLeft = path.resolve(leftPath);
  const resolvedRight = path.resolve(rightPath);

  if (process.platform === "win32") {
    return resolvedLeft.toLowerCase() === resolvedRight.toLowerCase();
  }

  return resolvedLeft === resolvedRight;
}

function normalizePath(filePath) {
  return filePath.split(path.sep).join("/");
}

function escapeRegex(text) {
  return text.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

function globToRegExp(pattern) {
  const normalized = normalizePath(pattern);
  let regex = "^";

  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index];

    if (character === "*") {
      const nextCharacter = normalized[index + 1];
      if (nextCharacter === "*") {
        regex += ".*";
        index += 1;
      } else {
        regex += "[^/]*";
      }
      continue;
    }

    if (character === "?") {
      regex += "[^/]";
      continue;
    }

    regex += escapeRegex(character);
  }

  regex += "$";
  return new RegExp(regex);
}

function readIgnorePatterns() {
  if (!fs.existsSync(buildIgnorePath)) {
    return [];
  }

  return fs.readFileSync(buildIgnorePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map((line) => line.replace(/^\.?\//, ""));
}

function createIgnoreMatchers(ignorePatterns) {
  return ignorePatterns.map((pattern) => {
    const normalizedPattern = normalizePath(pattern);

    if (!normalizedPattern.includes("/") && !normalizedPattern.includes("*") && !normalizedPattern.includes("?")) {
      return {
        matches(relativePath) {
          const basename = path.posix.basename(relativePath);
          return relativePath === normalizedPattern || basename === normalizedPattern;
        },
      };
    }

    const matchesWholeTree = normalizedPattern.endsWith("/");
    const basePattern = matchesWholeTree ? normalizedPattern.slice(0, -1) : normalizedPattern;
    const matcher = globToRegExp(basePattern);

    return {
      matches(relativePath, isDirectory) {
        if (matcher.test(relativePath)) {
          return true;
        }

        if (matchesWholeTree && isDirectory && relativePath === basePattern) {
          return true;
        }

        if (!normalizedPattern.includes("/") && !isDirectory) {
          return path.posix.basename(relativePath) === basePattern;
        }

        return false;
      },
    };
  });
}

function shouldIgnore(relativePath, isDirectory, ignoreMatchers) {
  if (relativePath === ".buildignore") {
    return true;
  }

  return ignoreMatchers.some((matcher) => matcher.matches(relativePath, isDirectory));
}

function collectFilesToArchive(currentDir, relativeDir, ignoreMatchers, files) {
  const entries = fs.readdirSync(currentDir, { withFileTypes: true });

  for (const entry of entries) {
    const entryRelativePath = relativeDir ? path.posix.join(relativeDir, entry.name) : entry.name;
    if (shouldIgnore(entryRelativePath, entry.isDirectory(), ignoreMatchers)) {
      continue;
    }

    const entryAbsolutePath = path.join(currentDir, entry.name);

    if (entry.isDirectory()) {
      collectFilesToArchive(entryAbsolutePath, entryRelativePath, ignoreMatchers, files);
      continue;
    }

    if (entry.isFile()) {
      files.push({
        absolutePath: entryAbsolutePath,
        relativePath: entryRelativePath,
      });
    }
  }
}

function createZipArchive() {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(distDir, { recursive: true });
    fs.rmSync(archivePath, { force: true });

    const ignorePatterns = readIgnorePatterns();
    const ignoreMatchers = createIgnoreMatchers(ignorePatterns);
    const filesToArchive = [];
    collectFilesToArchive(sourceResourcePackDir, "", ignoreMatchers, filesToArchive);

    const output = fs.createWriteStream(archivePath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", () => resolve(archive.pointer()));
    output.on("error", reject);
    archive.on("error", reject);

    archive.pipe(output);
    for (const file of filesToArchive) {
      archive.file(file.absolutePath, { name: file.relativePath });
    }
    archive.finalize();
  });
}

async function main() {
  assertDirExists(sourceResourcePackDir, "resourcepack directory");

  const bytesWritten = await createZipArchive();

  console.log(
    `buildResourcePack complete. Wrote dist/${archiveName} (${bytesWritten} bytes)`
  );

  const destinationFolder = process.argv[2];
  if (destinationFolder) {
    if (!fs.existsSync(destinationFolder)) {
      throw new Error(`Destination folder does not exist: ${destinationFolder}`);
    }
    const destinationPath = path.join(destinationFolder, archiveName);
    if (isSamePath(archivePath, destinationPath)) {
      return;
    }
    fs.cpSync(archivePath, destinationPath, { force: true });
    console.log(`Copied to ${destinationPath}`);
  }
}

main().catch((error) => {
  console.error(`buildResourcePack failed: ${error.message}`);
  process.exitCode = 1;
});
