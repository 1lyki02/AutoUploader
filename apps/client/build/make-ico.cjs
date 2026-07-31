const fs = require("fs");
const path = require("path");
async function main() {
  const pngToIco = require("png-to-ico");
  const dir = "C:/Users/Mi/Desktop/AutoUploader/apps/client/build/ico-tmp";
  const files = ["16","24","32","48","64","128","256"].map(s => path.join(dir, `icon-${s}.png`));
  const buf = await pngToIco(files);
  fs.writeFileSync("C:/Users/Mi/Desktop/AutoUploader/apps/client/build/icon.ico", buf);
  console.log("wrote ico", buf.length, "header", [...buf.subarray(0,6)].join(","));
}
main().catch((e) => { console.error(e); process.exit(1); });
