// 色票對比檢查（WCAG，從 cheng-daily 搬來並改成墨綠）：node scripts/contrast-check.js
// 讀 style.css 最上面日間／夜間兩組色票，檢查文字與底色的對比 ≥ 4.5。
const fs = require("fs");
const path = require("path");
const css = fs.readFileSync(path.join(__dirname, "..", "style.css"), "utf8");
let failed = 0;
function check(name, ok, detail) {
  if (ok) { console.log("  ✓ " + name); return; }
  failed++;
  console.log("  ✗ " + name + (detail ? "\n    " + JSON.stringify(detail) : ""));
}
const lightBlock = css.slice(css.indexOf(":root {"), css.indexOf("@media (prefers-color-scheme: dark)"));
const darkStart = css.indexOf("@media (prefers-color-scheme: dark)");
const darkBlock = css.slice(darkStart, css.indexOf("}\n}", darkStart));
const vars = (block) => { const o = {}; block.replace(/--([a-z-]+):\s*(#[0-9a-fA-F]{6})/g, (_, k, v) => { o[k] = v; }); return o; };
const lum = (hex) => {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

console.log("視覺主題：色票對比（WCAG）");
[["日間", vars(lightBlock)], ["夜間", vars(darkBlock)]].forEach(([name, v]) => {
  const pairs = [
    ["內文 / 頁面底", v.text, v.bg], ["內文 / 卡片", v.text, v["card-bg"]], ["內文 / 輸入欄", v.text, v["input-bg"]],
    ["次要文字 / 卡片", v["text-dim"], v["card-bg"]], ["次要文字 / 頁面底", v["text-dim"], v.bg],
    ["主按鈕文字 / 墨綠", v["on-accent"], v.accent], ["墨綠 / 卡片（連結、框）", v.accent, v["card-bg"]],
    ["黃銅文字 / 卡片", v["brass-text"], v["card-bg"]], ["錯誤色 / 卡片", v.danger, v["card-bg"]],
    ["成功提示文字 / 底", v["success-text"], v["success-bg"]],
  ];
  pairs.forEach(([label, fg, bg]) => { const r = ratio(fg, bg); check(`${name}：${label} 對比 ${r.toFixed(2)} ≥ 4.5`, r >= 4.5, { fg, bg, r }); });
});
if (failed) { console.log("\n" + failed + " 項失敗"); process.exit(1); }
console.log("\n全部通過");
