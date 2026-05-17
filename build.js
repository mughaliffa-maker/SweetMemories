const fs = require("fs");
const path = require("path");

const root = __dirname;
const out = path.join(root, "public");
const itemsToCopy = ["index.html", "assets", "css", "js"];

function copyRecursive(source, target) {
  const stat = fs.statSync(source);

  if (stat.isDirectory()) {
    fs.mkdirSync(target, { recursive: true });
    for (const item of fs.readdirSync(source)) {
      copyRecursive(path.join(source, item), path.join(target, item));
    }
    return;
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

if (fs.existsSync(out)) {
  fs.rmSync(out, { recursive: true, force: true });
}

fs.mkdirSync(out, { recursive: true });

for (const item of itemsToCopy) {
  copyRecursive(path.join(root, item), path.join(out, item));
}

console.log("CrumbCam static site built successfully.");
