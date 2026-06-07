const { execSync } = require("child_process");

try {
  console.log("Running build...");
  execSync("node scripts/build.js", { stdio: "inherit" });

  console.log("Running buildResourcePack...");
  execSync("npm run buildResourcePack", { stdio: "inherit" });

  console.log("Build complete!");
} catch (error) {
  process.exitCode = 1;
}
