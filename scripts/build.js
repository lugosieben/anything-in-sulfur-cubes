const { execSync } = require("child_process");

const destination = process.argv[2];

try {
  console.log("Running buildData...");
  execSync("npm run buildData", { stdio: "inherit" });

  console.log("Running buildDatapack...");
  if (destination) {
    execSync(`node scripts/buildDatapack.js "${destination}"`, { stdio: "inherit" });
  } else {
    execSync("npm run buildDatapack", { stdio: "inherit" });
  }

  console.log("Running clean...");
  execSync("npm run clean", { stdio: "inherit" });

  console.log("Build complete!");
} catch (error) {
  process.exitCode = 1;
}
