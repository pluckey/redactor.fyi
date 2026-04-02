import { build, context } from "esbuild";

const watch = process.argv.includes("--watch");

const shared = {
  bundle: true,
  format: "esm",
  target: "chrome120",
  logLevel: "info",
};

const entryPoints = [
  { entryPoints: ["src/content/main.ts"], outfile: "dist/content.js" },
  { entryPoints: ["src/background.ts"], outfile: "dist/background.js" },
  { entryPoints: ["src/popup/main.ts"], outfile: "dist/popup.js" },
];

if (watch) {
  const contexts = await Promise.all(
    entryPoints.map((ep) => context({ ...shared, ...ep }))
  );
  await Promise.all(contexts.map((ctx) => ctx.watch()));
  console.log("Watching for changes...");
} else {
  await Promise.all(entryPoints.map((ep) => build({ ...shared, ...ep })));
}
