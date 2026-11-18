import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import test from "node:test";
import { advisory, classifyAudit, parseAudit, root, verifyInstalledPatch, verifyPin } from "./dependency-security.mjs";

const require = createRequire(import.meta.url);
const { isMatch, makeRe } = require("picomatch");
const known = { name: "picomatch", url: advisory, severity: "high" };
const finding = (name, via, severity = "high") => ({ name, via, severity });
function report(vulnerabilities = {}) {
  return { auditReportVersion: 2, vulnerabilities, metadata: { vulnerabilities: {
    high: Object.values(vulnerabilities).filter(item => item.severity === "high").length,
    critical: Object.values(vulnerabilities).filter(item => item.severity === "critical").length,
  } } };
}

test("only the integrity-locked reviewed parser is installed for all build consumers", () => {
  verifyInstalledPatch();
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));
  for (const field of ["version", "resolved", "integrity"]) {
    const changed = structuredClone(lock);
    changed.packages["node_modules/picomatch"][field] = "unreviewed";
    assert.throws(() => verifyPin(manifest, changed));
  }
  assert.throws(() => verifyPin({ overrides: { picomatch: "^4" } }, lock));
  assert.throws(() => verifyPin(manifest, { packages: {} }));
  const nested = structuredClone(lock);
  nested.packages["node_modules/other/node_modules/picomatch"] = { version: "4.0.4" };
  assert.throws(() => verifyPin(manifest, nested));
});

test("single-branch attack patterns finish within an isolated two-second deadline", () => {
  const script = `
    const assert = require("node:assert/strict");
    const { isMatch } = require("picomatch");
    for (const options of [{}, { dot: true }, { capture: true }, { windows: true }, { bash: true }]) {
      for (const pattern of ["+(*)a", "+(*a)", "*(a*)b", "+(a*b)c"]) {
        assert.equal(isMatch("a".repeat(10000) + "!", pattern, options), false);
      }
    }
  `;
  execFileSync(process.execPath, ["-e", script], { cwd: root, timeout: 2000, stdio: "pipe" });
});

test("ordinary extglob, suffix, escaping, capture and path behavior remains intact", () => {
  for (const [pattern, accepted, rejected] of [
    ["+(*)c", ["abc", "c"], ["ab!"]],
    ["+(*a)", ["a", "aba", "aaa"], ["b", "aaa!"]],
    ["+(a*)", ["a", "aba"], ["b"]],
    ["+(a*b)", ["ab", "abab", "acbab"], ["a", "aba"]],
    ["+(a*b*c)", ["abc", "abcabc", "axbyc"], ["ab", "abc!"]],
    ["*(a*b)c", ["c", "abc", "ababc"], ["abb"]],
    ["x+(*a)y", ["xay", "xabaay"], ["xby"]],
  ]) {
    for (const value of accepted) assert(isMatch(value, pattern), `${pattern}: ${value}`);
    for (const value of rejected) assert(!isMatch(value, pattern), `${pattern}: ${value}`);
    assert(!/\)[+*]/.test(makeRe(pattern).source), pattern);
  }
  assert(isMatch("*a*a", "+(\\*a)"));
  assert(isMatch("foobar", "+(foo|bar)"));
  assert.deepEqual(makeRe("+(*a)", { capture: true }).exec("aba").slice(1), ["aba", "ab"]);
  assert(!isMatch("a/b.js", "*.js"));
  assert(isMatch("a/b.js", "**/*.js"));
  assert(isMatch(".hidden", "+(*)"));
  assert(!isMatch(".hidden.js", "*.js"));
  assert(isMatch(".hidden.js", "*.js", { dot: true }));
});

test("only the named advisory and its exclusively dependent findings are source-remediated", () => {
  const result = classifyAudit(report({
    picomatch: finding("picomatch", [known]),
    fdir: finding("fdir", ["picomatch"]),
    tinyglobby: finding("tinyglobby", ["fdir", "picomatch"]),
    vite: finding("vite", ["picomatch", "tinyglobby"]),
  }));
  assert.deepEqual(result.remediated.sort(), ["fdir", "picomatch", "tinyglobby", "vite"]);
  assert.deepEqual(result.blocking, []);
  assert.deepEqual(classifyAudit(report()), { remediated: [], blocking: [] });
});

test("new advisories, changed package attribution and mixed advisory chains still block", () => {
  const other = { ...known, url: "https://github.com/advisories/GHSA-other" };
  assert.deepEqual(classifyAudit(report({
    picomatch: finding("picomatch", [known, other]),
    vite: finding("vite", ["picomatch"]),
  })).blocking.sort(), ["picomatch", "vite"]);
  assert.deepEqual(classifyAudit(report({
    other: finding("other", [{ ...known, name: "other" }], "critical"),
  })).blocking, ["other"]);
  assert.deepEqual(classifyAudit(report({
    picomatch: finding("picomatch", []),
  })).blocking, ["picomatch"]);
  const moderate = { ...other, severity: "moderate" };
  assert.deepEqual(classifyAudit(report({
    picomatch: finding("picomatch", [known]),
    vite: finding("vite", ["picomatch", moderate]),
  })).blocking, []);
  assert.deepEqual(classifyAudit(report({
    picomatch: finding("picomatch", [known]),
    other: finding("other", [moderate], "moderate"),
    vite: finding("vite", ["picomatch", "other"]),
  })).blocking, []);
  assert.deepEqual(classifyAudit(report({
    picomatch: finding("picomatch", [known]),
    vite: finding("vite", ["picomatch", moderate, other]),
  })).blocking, ["vite"]);
});

test("audit transport errors, invalid/incomplete output and unresolved/cyclic chains fail closed", () => {
  const stdout = JSON.stringify(report());
  for (const result of [
    { status: 2, stdout }, { status: null, signal: "SIGTERM", stdout },
    { status: 1, error: new Error("offline"), stdout }, { status: 0, stdout: "" }, { status: 1, stdout },
    { status: 1, stdout: JSON.stringify({ ...report(), error: { code: "E429" } }) },
  ]) assert.throws(() => parseAudit(result));
  for (const invalid of [
    {}, { ...report(), auditReportVersion: 3 },
    { ...report(), metadata: { vulnerabilities: { high: 1, critical: 0 } } },
    report({ vite: finding("vite", ["missing"]) }),
    report({ vite: finding("vite", ["vite"]) }),
    report({ vite: finding("other", [known]) }),
    report({ vite: finding("vite", [null]) }),
  ]) assert.throws(() => classifyAudit(invalid));
  assert.deepEqual(parseAudit({ status: 0, stdout }), { remediated: [], blocking: [] });
});
