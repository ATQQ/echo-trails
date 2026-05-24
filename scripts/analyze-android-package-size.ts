import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const projectRoot = resolve(import.meta.dir, '..');
const tauriConfigPath = join(projectRoot, 'packages/native/src-tauri/tauri.conf.json');
const appDistPath = join(projectRoot, 'packages/app/dist');
const releaseDir = join(projectRoot, 'release');
const androidOutputDir = join(projectRoot, 'packages/native/src-tauri/gen/android/app/build/outputs');
const strippedSoPath = join(
  projectRoot,
  'packages/native/src-tauri/gen/android/app/build/intermediates/stripped_native_libs/arm64Release/stripArm64ReleaseDebugSymbols/out/lib/arm64-v8a/libtauri_app_lib.so',
);

type Artifact = {
  label: string;
  path: string;
};

type ZipEntry = {
  name: string;
  uncompressedSize: number;
  compressedSize: number | null;
  method: string | null;
};

type SectionEntry = {
  name: string;
  size: number;
  type: string;
};

function readVersion() {
  if (!existsSync(tauriConfigPath)) return 'unknown';
  const tauriConfig = JSON.parse(readFileSync(tauriConfigPath, 'utf-8'));
  return tauriConfig.version ?? 'unknown';
}

function formatBytes(bytes: number) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let index = 0;

  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }

  const digits = index === 0 ? 0 : 2;
  return `${value.toFixed(digits)} ${units[index]}`;
}

function fileSize(filePath: string) {
  return statSync(filePath).size;
}

function directorySize(dirPath: string): number {
  if (!existsSync(dirPath)) return 0;

  let total = 0;
  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    const entryPath = join(dirPath, entry.name);
    if (entry.isDirectory()) {
      total += directorySize(entryPath);
    } else if (entry.isFile()) {
      total += fileSize(entryPath);
    }
  }
  return total;
}

function runOptional(command: string, args: string[]) {
  try {
    return execFileSync(command, args, {
      cwd: projectRoot,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return '';
  }
}

function parseZipInfo(zipPath: string): ZipEntry[] {
  const output = runOptional('zipinfo', ['-l', zipPath]);
  if (!output) return [];

  return output
    .split('\n')
    .map((line) => {
      const match = line
        .trim()
        .match(/^\S+\s+\S+\s+\S+\s+(\d+)\s+\S+\s+(\d+)\s+(\S+)\s+\S+\s+\S+\s+(.+)$/);

      if (!match) return null;

      return {
        uncompressedSize: Number(match[1]),
        compressedSize: Number(match[2]),
        method: match[3],
        name: match[4],
      };
    })
    .filter((entry): entry is ZipEntry => Boolean(entry));
}

function parseUnzipList(zipPath: string): ZipEntry[] {
  const output = runOptional('unzip', ['-l', zipPath]);
  if (!output) return [];

  return output
    .split('\n')
    .map((line) => {
      const match = line.trim().match(/^(\d+)\s+\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2}\s+(.+)$/);
      if (!match) return null;

      return {
        uncompressedSize: Number(match[1]),
        compressedSize: null,
        method: null,
        name: match[2],
      };
    })
    .filter((entry): entry is ZipEntry => Boolean(entry));
}

function readZipEntries(zipPath: string) {
  const entries = parseZipInfo(zipPath);
  return entries.length > 0 ? entries : parseUnzipList(zipPath);
}

function parseObjdumpSections(soPath: string): SectionEntry[] {
  const output = runOptional('objdump', ['-h', soPath]);
  if (!output) return [];

  return output
    .split('\n')
    .map((line) => {
      const match = line.trim().match(/^\d+\s+(\S+)\s+([0-9a-fA-F]+)\s+[0-9a-fA-F]+(?:\s+(.+))?$/);
      if (!match) return null;

      return {
        name: match[1],
        size: Number.parseInt(match[2], 16),
        type: match[3]?.trim() ?? '',
      };
    })
    .filter((entry): entry is SectionEntry => Boolean(entry));
}

function listArtifacts(version: string): Artifact[] {
  const candidates: Artifact[] = [
    {
      label: 'release arm64 APK',
      path: join(releaseDir, `echo-trails-release-${version}.apk`),
    },
    {
      label: 'release arm64 AAB',
      path: join(releaseDir, `echo-trails-release-${version}.aab`),
    },
    {
      label: 'build arm64 APK',
      path: join(androidOutputDir, 'apk/arm64/release/app-arm64-release.apk'),
    },
    {
      label: 'build universal APK',
      path: join(androidOutputDir, 'apk/universal/release/app-universal-release.apk'),
    },
    {
      label: 'build arm64 AAB',
      path: join(androidOutputDir, 'bundle/arm64Release/app-arm64-release.aab'),
    },
    {
      label: 'build universal AAB',
      path: join(androidOutputDir, 'bundle/universalRelease/app-universal-release.aab'),
    },
  ];

  return candidates.filter((artifact) => existsSync(artifact.path));
}

function printArtifacts(artifacts: Artifact[]) {
  console.log('\n## Artifacts');
  console.log('| Artifact | Size | Path |');
  console.log('| --- | ---: | --- |');

  for (const artifact of artifacts) {
    console.log(`| ${artifact.label} | ${formatBytes(fileSize(artifact.path))} | ${artifact.path} |`);
  }
}

function printDirectoryBaseline() {
  console.log('\n## Directories and native library');
  console.log('| Target | Size | Path |');
  console.log('| --- | ---: | --- |');

  if (existsSync(appDistPath)) {
    console.log(`| app dist | ${formatBytes(directorySize(appDistPath))} | ${appDistPath} |`);
  } else {
    console.log(`| app dist | missing | ${appDistPath} |`);
  }

  if (existsSync(strippedSoPath)) {
    console.log(`| arm64 libtauri_app_lib.so | ${formatBytes(fileSize(strippedSoPath))} | ${strippedSoPath} |`);
  } else {
    console.log(`| arm64 libtauri_app_lib.so | missing | ${strippedSoPath} |`);
  }
}

function printTopZipEntries(artifact: Artifact, limit = 12) {
  const entries = readZipEntries(artifact.path)
    .sort((a, b) => b.uncompressedSize - a.uncompressedSize)
    .slice(0, limit);

  if (entries.length === 0) return;

  console.log(`\n## Largest entries: ${artifact.label} (${basename(artifact.path)})`);
  console.log('| Entry | Uncompressed | Compressed | Method |');
  console.log('| --- | ---: | ---: | --- |');

  for (const entry of entries) {
    console.log(
      `| ${entry.name} | ${formatBytes(entry.uncompressedSize)} | ${
        entry.compressedSize === null ? '-' : formatBytes(entry.compressedSize)
      } | ${entry.method ?? '-'} |`,
    );
  }
}

function printSoSections() {
  if (!existsSync(strippedSoPath)) return;

  const sections = parseObjdumpSections(strippedSoPath)
    .sort((a, b) => b.size - a.size)
    .slice(0, 12);

  if (sections.length === 0) return;

  console.log('\n## Largest ELF sections: arm64 libtauri_app_lib.so');
  console.log('| Section | Size | Type |');
  console.log('| --- | ---: | --- |');

  for (const section of sections) {
    console.log(`| ${section.name} | ${formatBytes(section.size)} | ${section.type} |`);
  }
}

function main() {
  const version = readVersion();
  const artifacts = listArtifacts(version);
  const primaryArtifacts = artifacts.filter((artifact) => ['.apk', '.aab'].includes(extname(artifact.path)));

  console.log(`# Android package size analysis`);
  console.log(`\nVersion: ${version}`);

  printArtifacts(artifacts);
  printDirectoryBaseline();

  for (const artifact of primaryArtifacts) {
    if (artifact.label.includes('universal')) continue;
    printTopZipEntries(artifact);
  }

  printSoSections();
}

main();
