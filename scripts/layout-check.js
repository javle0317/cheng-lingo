// 字帖版面計算的回歸檢查（從 cheng-daily 搬來）：node scripts/layout-check.js
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const root = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
let failed = 0;
function check(name, ok, detail) {
  if (ok) { console.log("  ✓ " + name); return; }
  failed++;
  console.log("  ✗ " + name + (detail !== undefined ? "\n    " + JSON.stringify(detail) : ""));
}

console.log("練字字帖：版面計算（copybook-layout.js）");
{
  const L = vm.createContext({ console, Math, Array, String, Number, Set, Object });
  vm.runInContext(read("copybook-layout.js"), L, { filename: "copybook-layout.js" });
  const E = (id, text, title = id) => ({ id, title, author: "", text });
  check("zhClauses：依標點與換行切句，空白去掉、標點不留", JSON.stringify(L.zhClauses("床前明月光，疑是地上霜。\n舉頭 望明月，低頭思故鄉。")) === JSON.stringify(["床前明月光", "疑是地上霜", "舉頭望明月", "低頭思故鄉"]));
  let r = L.packZhColumns({ entries: [E("a", "床前明月光，疑是地上霜。舉頭望明月，低頭思故鄉。")], rows: 14, maxCols: 15 });
  check("packZh：五言絕句每欄 14 字 → 兩句一欄（10 字）× 2 欄，不會是 15 + 5", r.columns.length === 2 && r.columns.every(c => c.chars.length === 10), r.columns.map(c => c.chars.join("")));
  r = L.packZhColumns({ entries: [E("a", "白日依山盡，黃河入海流。欲窮千里目，更上一層樓。")], rows: 20, maxCols: 15 });
  check("packZh：每欄 20 字時一首五絕剛好一欄（對照使用者的字帖）", r.columns.length === 1 && r.columns[0].chars.length === 20);
  r = L.packZhColumns({ entries: [E("a", "朝辭白帝彩雲間，千里江陵一日還。兩岸猿聲啼不住，輕舟已過萬重山。")], rows: 14, maxCols: 15 });
  check("packZh：七言絕句兩句一欄 14 字 × 2 欄", r.columns.length === 2 && r.columns.every(c => c.chars.length === 14));
  r = L.packZhColumns({ entries: [E("a", "一二三四五六七八九十甲乙丙丁戊己庚辛壬癸")], rows: 8, maxCols: 10 });
  check("packZh：超過一欄的長句才拆（20 字、每欄 8 → 3 欄）", r.columns.length === 3 && r.columns[2].chars.length === 4);
  r = L.packZhColumns({ entries: [E("a", "甲甲甲甲甲，乙乙乙乙乙。丙丙丙丙丙，丁丁丁丁丁。")], rows: 5, maxCols: 3 });
  check("packZh：第一篇排不完時，欄數用完就停，next 指到下一個沒排的子句", r.columns.length === 3 && r.next && r.next.id === "a" && r.next.clauseIndex === 3 && r.used.length === 1, r);
  r = L.packZhColumns({ entries: [E("a", "甲甲甲，乙乙乙。"), E("b", "丙丙丙丙丙丙，丁丁丁丁丁丁。戊戊戊戊戊戊，己己己己己己。"), E("c", "庚庚庚，辛辛辛。")], rows: 6, maxCols: 3 });
  check("packZh：第二篇起整篇排不進剩下的欄數就跳過（不切到一半），改排後面放得下的", r.used.map(u => u.id).join() === "a,c" && r.columns.length === 2 && r.next === null, r);
  r = L.packZhColumns({ entries: [E("a", "甲甲甲，乙乙乙。丙丙丙，丁丁丁。")], startClause: 2, rows: 8, maxCols: 5 });
  check("packZh：startClause 從指定子句接著排", r.columns[0].chars.join("") === "丙丙丙丁丁丁", r.columns);
  r = L.packZhColumns({ entries: [E("a", "甲甲甲，乙乙乙。"), E("b", "丙丙丙，丁丁丁。")], rows: 14, maxCols: 5 });
  check("packZh：不同篇不接在同一欄、每篇第一欄有 first 標記", r.columns.length === 2 && r.columns.every(c => c.first) && r.used.length === 2);
  check("zhEntryColumns：跟實際排版欄數一致（五絕 2、七律 4、20 字句每欄 8 = 3）", L.zhEntryColumns(["床前明月光", "疑是地上霜", "舉頭望明月", "低頭思故鄉"], 14) === 2 && L.zhEntryColumns(Array(8).fill("七七七七七七七"), 14) === 4 && L.zhEntryColumns(["一".repeat(20)], 8) === 3);
  const g = L.zhGeometry();
  check("zhGeometry：每欄 14 字 → 格高 12.7mm、字 10.4mm、欄距 17.8mm、一頁 15 欄（≈ 7 首絕句 = 一週）", g.cell === 12.7 && g.fontSize === 10.41 && g.pitch === 17.8 && g.sheetCols === 15, g);
  check("zhLabel：取「・」前面、最多 7 字", L.zhLabel("水調歌頭・明月幾時有") === "水調歌頭" && L.zhLabel("黃鶴樓送孟浩然之廣陵") === "黃鶴樓送孟浩然…");

  const measure = (t) => t.length * 2; // 一個字元 2mm
  let w = L.wrapEnLines({ entries: [E("a", "aaa bbb ccc ddd eee")], maxLines: 10, maxWidth: 16, measure });
  check("wrapEn：依單字換行（每行最多 8 字元）", JSON.stringify(w.lines.map(l => l.text)) === JSON.stringify(["aaa bbb", "ccc ddd", "eee"]), w.lines);
  w = L.wrapEnLines({ entries: [E("a", "aaa bbb ccc ddd eee")], maxLines: 2, maxWidth: 16, measure });
  check("wrapEn：行數用完就停，next 指到下一個單字", w.lines.length === 2 && w.next && w.next.wordIndex === 4, w);
  w = L.wrapEnLines({ entries: [E("a", "one two three four five six")], startWord: 3, maxLines: 5, maxWidth: 200, measure });
  check("wrapEn：startWord 從指定單字接著排", w.lines[0].text === "four five six");
  w = L.wrapEnLines({ entries: [E("a", "one two\nthree four")], maxLines: 5, maxWidth: 200, measure });
  check("wrapEn：段落（換行）另起一行", w.lines.length === 2 && w.lines[1].text === "three four");
  w = L.wrapEnLines({ entries: [E("a", "aaa bbb"), E("b", "ccc ddd eee fff ggg hhh iii jjj kkk"), E("c", "lll")], maxLines: 3, maxWidth: 16, measure });
  check("wrapEn：第二篇起整篇排不進剩下行數就跳過", w.used.map(u => u.id).join() === "a,c" && w.lines.length === 2 && w.next === null, w);
  const entries = ["a", "b", "c", "d"].map(id => E(id, "x"));
  const order = L.pickOrder(entries, ["a", "b"], () => 0);
  check("pickOrder：沒用過的排前面、最近用過的排後面", order.slice(0, 2).every(e => ["c", "d"].includes(e.id)) && order.slice(2).every(e => ["a", "b"].includes(e.id)), order.map(e => e.id));

  const svgZh = L.renderZhSvg({ columns: [{ chars: ["床", "前"], entryId: "a", first: true }, { chars: ["明"], entryId: "a", first: false }], titles: { a: "靜夜思<b>" } });
  check("renderZhSvg：沒有格線（只有淡淡的欄線、沒有 rect 格子）、字有畫出來、標題只在第一欄且有跳脫", !svgZh.includes("<rect") && !svgZh.includes("stroke-dasharray") && svgZh.includes(">床<") && (svgZh.match(/靜夜思&lt;b&gt;/g) || []).length === 1 && svgZh.includes('width="297mm"'));
  const svgEn = L.renderEnSvg({ lines: [{ text: "Hello & bye" }], header: "A <b>" });
  check("renderEnSvg：只有灰色文字、沒有任何四線格；文字有跳脫", svgEn.includes("Hello &amp; bye") && svgEn.includes("A &lt;b&gt;") && !svgEn.includes("stroke-dasharray") && svgEn.includes('height="297mm"'));
  const ge = L.enGeometry();
  check("enGeometry：行距 12mm → 一頁 21 行、字 6mm", ge.lines === 21 && ge.fontSize === 6, ge);
}

console.log("日文五十音頁");
{
  const L = vm.createContext({ console, Math, Array, String, Number, Set, Object });
  vm.runInContext(read("copybook-layout.js"), L, { filename: "copybook-layout.js" });
  const g = L.jaGeometry();
  check("jaGeometry：行距 11mm → 一頁 23 行、每行 15 格", g.lines === 23 && g.cells === 15, g);
  const cards = JSON.parse(read("data/cards.json"));
  const rows = [];
  cards.stages.filter(s => s.lang === "ja" && s.order === "seq" && /hiragana|katakana|dakuon|yoon/.test(s.id)).forEach(s => s.cards.forEach(c => rows.push({ id: c.id, name: c.back, tokens: c.front.split(/\s+/).filter(Boolean), readings: c.reading.split(/\s+/).filter(Boolean) })));
  check("假名行：平假名、片假名、濁音、拗音共 52 行，每行的假名與讀音一樣多", rows.length === 52 && rows.every(r => r.tokens.length > 0 && r.tokens.length === r.readings.length), rows.filter(r => r.tokens.length !== r.readings.length).map(r => r.id));
  let r = L.packJaRows({ rows, startIndex: 0, maxLines: g.lines });
  check("packJa：一頁整行放（あ〜た行 4 行 = 20 行，不切到第 5 行）", r.used.length === 4 && r.lines.length === 20 && r.next === 4, { used: r.used.length, lines: r.lines.length, next: r.next });
  r = L.packJaRows({ rows, startIndex: 7, maxLines: g.lines });
  check("packJa：從指定行開始（や行 3 + ら行 5 + わ行 3 + ア行 5 + カ行 5 = 21，再放サ行會超過）", r.used.map(x => x.id).join() === rows.slice(7, 12).map(x => x.id).join() && r.lines.length === 21, r.used.map(x => x.id));
  r = L.packJaRows({ rows, startIndex: rows.length - 1, maxLines: g.lines });
  check("packJa：最後一行放完，next 為 null", r.used.length === 1 && r.next === null);
  const svg = L.renderJaSvg({ lines: [{ kana: "あ", label: "a", rowId: "x", first: true }, { kana: "<", label: "&", rowId: "x", first: false }], header: "平假名・あ行" });
  check("renderJaSvg：每行 15 個灰字、羅馬拼音是小字、有跳脫、沒有格線 rect", (svg.match(/>あ</g) || []).length === 15 && svg.includes("&lt;") && svg.includes("&amp;") && !svg.includes("<rect") && svg.includes('width="210mm"'));
}

const copybook = JSON.parse(read("data/copybook.json"));
check("內建範例：每篇都有 id/lang/title/text，zh 與 en 都有，id 與標題都不重複", copybook.entries.length > 30 && copybook.entries.every(e => e.id && ["zh", "en"].includes(e.lang) && e.title && e.text) && new Set(copybook.entries.map(e => e.id)).size === copybook.entries.length && new Set(copybook.entries.map(e => e.lang + e.title)).size === copybook.entries.length);

console.log("頁面元素");
for (const [js, html] of [["lingo.js", "index.html"], ["placement.js", "placement.html"], ["copybook.js", "copybook.html"]]) {
  const src = fs.readFileSync(path.join(__dirname, "..", js), "utf8");
  const page = fs.readFileSync(path.join(__dirname, "..", html), "utf8");
  const used = [...new Set([...src.matchAll(/getElementById\("([A-Za-z0-9_-]+)"\)/g)].map(m => m[1]))];
  const missing = used.filter(id => !page.includes(`id="${id}"`) && !src.includes(`.id = "${id}"`));
  check(`${js} 用到的元素 id 都在 ${html} 裡（少了就是載入時報錯、整頁壞掉）`, missing.length === 0, missing);
}
if (failed) { console.log("\n" + failed + " 項失敗"); process.exit(1); }
console.log("\n全部通過");
