#!/usr/bin/env node
import { parseArgs } from "node:util";
import { execSync } from "node:child_process";
import { mkdirSync, statSync, renameSync, rmSync, unlinkSync } from "node:fs";
import { join, parse } from "node:path";

const REMOTE_FILE = "api-contracts/openapi/openapi.yaml";
const LOCAL_DIR = "api-contracts/openapi";
const OUT_DIR = join("src", "generated");

// 1. Parse CLI Arguments
const options = {
    repo: { type: "string" },
    tag: { type: "string" },
};

const { values } = parseArgs({
    options,
    args: process.argv.slice(2),
    strict: false, // allows arbitrary additional flags if needed
});

if (!values.repo || !values.tag) {
    console.error("Error: --repo and --tag are required.");
    console.error(
        "Usage: npm run fetch-dtos -- --repo notipswe/some-producer --tag v1.2.3"
    );
    process.exit(1);
}

// 2. Compute variables
const repoName = values.repo.split("/").pop();
const localFileName = `${repoName}-openapi.yaml`;
const localFilePath = join(LOCAL_DIR, localFileName);
const baseName = parse(localFileName).name;
const outFilePath = join(OUT_DIR, `${baseName}.ts`);

// 3. Ensure directories exist
mkdirSync(LOCAL_DIR, { recursive: true });
mkdirSync(OUT_DIR, { recursive: true });

// 4. Fetch the OpenAPI spec via GitHub CLI
console.log(`Fetching openapi.yaml from ${values.repo}@${values.tag}...`);
try {
    const ghCommand = `gh api -H "Accept: application/vnd.github.raw" "repos/${values.repo}/contents/${REMOTE_FILE}?ref=${values.tag}" > "${localFilePath}"`;
    execSync(ghCommand, { stdio: "inherit" });
} catch (error) {
    try {
        unlinkSync(localFilePath);
    } catch {}
    console.error("Error: Failed to fetch the OpenAPI spec from GitHub.");
    process.exit(1);
}

// 5. Verify the file isn't empty
const stats = statSync(localFilePath, { throwIfNoEntry: false });
if (!stats || stats.size === 0) {
    console.error(
        `Error: Fetched file is empty (${localFilePath}). Check --repo/--tag/--file and repository access.`
    );
    process.exit(1);
}
console.log(`  Saved → ${localFilePath}`);

// 6. Generate Zod Schemas
//    @hey-api/openapi-ts outputs to a directory, so we generate into a temp dir
//    and then move the single zod.gen.ts file to our flat structure.
const tmpDir = join(OUT_DIR, `.tmp-${baseName}`);
console.log(`Generating Zod schemas → ${outFilePath}`);
try {
    const generateCmd = `npx @hey-api/openapi-ts -i "${localFilePath}" -o "${tmpDir}" -p zod -s`;
    execSync(generateCmd, { stdio: "inherit" });
    renameSync(join(tmpDir, "zod.gen.ts"), outFilePath);
    rmSync(tmpDir, { recursive: true });
} catch (error) {
    console.error("Error: Failed to generate Zod schemas.");
    rmSync(tmpDir, { recursive: true, force: true });
    process.exit(1);
}

// 7. Format the output
console.log(`Formatting generated file...`);
try {
    execSync(`npx prettier --write "${outFilePath}"`, { stdio: "inherit" });
} catch (error) {
    console.error("Error: Failed to format the generated file.");
    process.exit(1);
}

console.log("Done.");
