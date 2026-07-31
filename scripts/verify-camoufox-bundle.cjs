const fs = require("fs");
const s = fs.readFileSync("apps/client/dist-electron/main/index.js", "utf8");
const hasRequire = /require\(["']camoufox-js["']\)/.test(s);
const hasDyn = s.includes("new Function") && s.includes("camoufox-js");
console.log(JSON.stringify({ hasRequire, hasDyn, mainExists: fs.existsSync("apps/client/dist-electron/main/index.js") }));
if (hasRequire || !hasDyn) process.exit(1);
