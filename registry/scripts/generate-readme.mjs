#!/usr/bin/env node

/**
 * Generates README.md from per-package metadata files.
 * Run: node scripts/generate-readme.mjs
 */

import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PACKAGES_DIR = join(ROOT, "software");

function loadPackages() {
	const dirs = readdirSync(PACKAGES_DIR, { withFileTypes: true })
		.filter((d) => d.isDirectory() && !d.name.startsWith("_"))
		.map((d) => d.name)
		.sort();

	const packages = [];
	for (const dir of dirs) {
		const metaPath = join(PACKAGES_DIR, dir, "agent-os-package.json");
		const artifactMetaPath = join(PACKAGES_DIR, dir, "agent-os-package.meta.json");
		if (!existsSync(metaPath)) continue;
		const meta = JSON.parse(readFileSync(metaPath, "utf8"));
		const artifactMeta = existsSync(artifactMetaPath)
			? JSON.parse(readFileSync(artifactMetaPath, "utf8"))
			: null;
		packages.push({ dir, ...meta, artifactMeta });
	}
	return packages;
}

function formatBytes(bytes) {
	if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) return "-";

	const units = ["B", "KiB", "MiB", "GiB"];
	let value = bytes;
	let unitIndex = 0;

	while (value >= 1024 && unitIndex < units.length - 1) {
		value /= 1024;
		unitIndex += 1;
	}

	const digits = value >= 100 || unitIndex === 0 ? 0 : value >= 10 ? 1 : 2;
	return `${value.toFixed(digits)} ${units[unitIndex]}`;
}

function generateTable(packages) {
	const wasm = packages.filter((p) => p.type === "wasm");
	const meta = packages.filter((p) => p.type === "meta");

	let table = "";

	table += "### WASM Command Packages\n\n";
	table += "| Package | apt Equivalent | Description | Source | Combined Size | Gzipped |\n";
	table += "|---------|---------------|-------------|--------|---------------|---------|\n";
	for (const pkg of wasm) {
		const status = pkg.status === "planned" ? " *(planned)*" : "";
		const aptName = pkg.aptName || "-";
		const totalSize = formatBytes(pkg.artifactMeta?.totalSize);
		const totalSizeGzip = formatBytes(pkg.artifactMeta?.totalSizeGzip);
		table += `| \`${pkg.name}\` | ${aptName} | ${pkg.description}${status} | ${pkg.source || "-"} | ${totalSize} | ${totalSizeGzip} |\n`;
	}

	table += "\n### Meta-Packages\n\n";
	table += "| Package | Description | Includes |\n";
	table += "|---------|-------------|----------|\n";
	for (const pkg of meta) {
		const includes = pkg.includes ? pkg.includes.join(", ") : "-";
		table += `| \`${pkg.name}\` | ${pkg.description} | ${includes} |\n`;
	}

	return table;
}

function generateReadme(packages) {
	const table = generateTable(packages);

	return `# agentOS Registry

Software packages for [agentOS](https://github.com/rivet-dev/rivet) that run inside VMs. This includes WASM command binaries and JavaScript agent/tool packages.

Non-software packages (filesystem drivers like S3, Google Drive, and sandbox providers) live in the main repo at [\`rivet-dev/rivet/agent-os/\`](https://github.com/rivet-dev/rivet/tree/main/agent-os/packages).

## Installation

Install individual packages:

\`\`\`bash
npm install @rivet-dev/agent-os-coreutils @rivet-dev/agent-os-grep
\`\`\`

Or use a meta-package for a complete set:

\`\`\`bash
npm install @rivet-dev/agent-os-common
\`\`\`

## Usage

Each package exports a descriptor with command metadata and a \`commandDir\` path pointing to the WASM binaries:

\`\`\`typescript
import coreutils from "@rivet-dev/agent-os-coreutils";
import grep from "@rivet-dev/agent-os-grep";

const vm = await AgentOs.create({
  packages: [coreutils, grep],
});
\`\`\`

## Package Types

### WASM Packages

Pre-built WebAssembly binaries that register as executable commands in the VM. Each WASM package provides one or more commands (e.g., \`coreutils\` provides \`sh\`, \`cat\`, \`ls\`, etc.). Commands are compiled from Rust and C to WASM and distributed as npm packages.

### JavaScript Packages

Node.js agent and tool packages that are projected into the VM via the ModuleAccessFileSystem overlay. These include coding agents (like PI) and CLI tools that run as Node.js scripts inside the VM.

## Packages

<!-- BEGIN PACKAGE TABLE -->
${table}<!-- END PACKAGE TABLE -->

## Building

All WASM command source code lives in \`native/\`. Requires a Rust nightly toolchain (auto-installed via \`rust-toolchain.toml\`).

\`\`\`bash
# Build everything (WASM binaries + TypeScript packages)
make build

# Or step by step:
make build-wasm    # Compile Rust + C commands to WASM
make copy-wasm     # Copy binaries into per-package wasm/ directories
make build         # Build TypeScript (includes above steps)
\`\`\`

## Publishing

All packages use date-based versioning (\`0.0.{YYMMDDHHmmss}\`). Publishing skips unchanged packages via content hashing.

\`\`\`bash
# Dry run
make publish-dry

# Publish changed packages
make publish

# Force publish all
make publish-force
\`\`\`

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to add new packages.

## License

Apache-2.0
`;
}

const packages = loadPackages();
const readme = generateReadme(packages);
writeFileSync(join(ROOT, "README.md"), readme);
console.log(`Generated README.md with ${packages.length} packages`);
