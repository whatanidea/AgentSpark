import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const advisory = "https://github.com/advisories/GHSA-fc5q-39xc-vjpf";
export const patchedSource = "https://codeload.github.com/micromatch/picomatch/tar.gz/c63a5bf4e61dbdb81bc41e97dc2616c30acce337";
const integrity = "sha512-fUkAZYcy1VfryJblryQ+ixip/7oRgd3AT/O6Z6fnXiArrU+8phmzjO5C63Tod+qihQ9u+CYUy+IsuI2qV+HL7g==";
const parserHash = "5ec28434bfb056f856eabbaec0babbe467c855bbb7c96889d91015f2d6b0ece4";
export const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const json = path => JSON.parse(readFileSync(path, "utf8"));

export function verifyPin(manifest, lock) {
  assert.equal(manifest.overrides?.picomatch, patchedSource, "Unreviewed picomatch override.");
  const copies = Object.entries(lock.packages).filter(([path]) => /(^|\/)node_modules\/picomatch$/.test(path));
  assert(copies.length > 0, "Missing locked picomatch.");
  for (const [, dependency] of copies) {
    assert.equal(dependency.version, "4.0.7", "Unexpected patched package version.");
    assert.equal(dependency.resolved, patchedSource, "Unreviewed picomatch source.");
    assert.equal(dependency.integrity, integrity, "Unreviewed picomatch archive integrity.");
  }
  return copies.map(([path]) => path);
}

export function verifyInstalledPatch() {
  const copies = verifyPin(json(join(root, "package.json")), json(join(root, "package-lock.json")));
  for (const path of copies) {
    const parser = readFileSync(join(root, path, "lib", "parse.js"));
    assert.equal(createHash("sha256").update(parser).digest("hex"), parserHash, "Installed picomatch parser differs from the reviewed fix.");
  }
  const entry = require.resolve("picomatch");
  for (const consumer of ["vite", "tinyglobby", "fdir"]) {
    assert.equal(createRequire(require.resolve(consumer)).resolve("picomatch"), entry, `${consumer} does not use the reviewed fix.`);
  }
}

export function classifyAudit(report) {
  assert.equal(report.auditReportVersion, 2, "Unsupported npm audit report.");
  assert(!report.error, "npm audit returned a registry/report error.");
  const vulnerabilities = report.vulnerabilities;
  assert(vulnerabilities && typeof vulnerabilities === "object" && !Array.isArray(vulnerabilities), "Missing audit findings.");
  const entries = Object.entries(vulnerabilities);
  for (const [name, finding] of entries) {
    assert.equal(finding.name, name, "Inconsistent audit finding.");
    assert(["info", "low", "moderate", "high", "critical"].includes(finding.severity), "Unknown audit severity.");
    assert(Array.isArray(finding.via), "Missing advisory chain.");
  }
  for (const severity of ["high", "critical"]) {
    assert.equal(report.metadata?.vulnerabilities?.[severity], entries.filter(([, item]) => item.severity === severity).length, "Incomplete audit findings.");
  }
  function onlyPatched(name, ancestors = new Set()) {
    assert(!ancestors.has(name), "Cyclic audit advisory chain.");
    const finding = vulnerabilities[name];
    assert(finding, "Unresolved audit advisory chain.");
    if (["info", "low", "moderate"].includes(finding.severity)) return true;
    if (!finding.via.length) return false;
    const visited = new Set([...ancestors, name]);
    return finding.via.every(item => {
      if (typeof item === "string") return onlyPatched(item, visited);
      assert(item && typeof item === "object", "Invalid audit advisory.");
      assert(["info", "low", "moderate", "high", "critical"].includes(item.severity), "Unknown advisory severity.");
      if (["info", "low", "moderate"].includes(item.severity)) return true;
      return name === "picomatch" && item.name === "picomatch" && item.url === advisory;
    });
  }
  const remediated = [];
  const blocking = [];
  for (const [name, finding] of entries) {
    if (!["high", "critical"].includes(finding.severity)) continue;
    (onlyPatched(name) ? remediated : blocking).push(name);
  }
  return { remediated, blocking };
}

export function parseAudit(result) {
  assert(!result.error && !result.signal && [0, 1].includes(result.status), "npm audit failed to execute successfully.");
  const findings = classifyAudit(JSON.parse(result.stdout));
  assert(result.status === 0 || findings.remediated.length || findings.blocking.length, "npm audit failed without a high/critical finding.");
  return findings;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyInstalledPatch();
  assert(process.env.npm_execpath, "Run this gate with npm run audit:dependencies.");
  const result = spawnSync(process.execPath, [process.env.npm_execpath, "audit", "--json", "--audit-level=high"], {
    cwd: root, encoding: "utf8", timeout: 120000, maxBuffer: 8 * 1024 * 1024,
  });
  if (result.stderr) process.stderr.write(result.stderr);
  const { remediated, blocking } = parseAudit(result);
  const report = JSON.parse(result.stdout);
  console.log(`npm audit findings before source verification: ${JSON.stringify(report.metadata.vulnerabilities)}`);
  for (const [name, finding] of Object.entries(report.vulnerabilities)) {
    for (const item of finding.via) {
      if (typeof item === "object" && item.url !== advisory) {
        console.log(`REPORTED ${item.severity} ${name}: ${item.title || item.url} (${item.url})`);
      }
    }
  }
  if (remediated.length) {
    console.log(`SOURCE-REMEDIATED (not an official npm release): ${advisory}`);
    console.log(`Verified immutable source, archive integrity, installed parser and consumers: ${patchedSource}`);
    console.log(`High/critical portions of npm version-only findings remediated: ${remediated.join(", ")}. Lower-severity advisories remain reported.`);
  }
  for (const name of blocking) console.error(JSON.stringify(report.vulnerabilities[name]));
  assert.equal(blocking.length, 0, `Unremediated high/critical npm findings: ${blocking.join(", ")}`);
  console.log("Dependency security gate passed; no other high/critical findings accepted.");
}
