
import { execSync } from 'node:child_process';
import prompts from 'prompts';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const appPackagePath = path.join(rootDir, 'packages/app/package.json');

async function main() {
  // 1. Get current version
  if (!fs.existsSync(appPackagePath)) {
    console.error(`Error: Could not find ${appPackagePath}`);
    process.exit(1);
  }

  const appPkg = JSON.parse(fs.readFileSync(appPackagePath, 'utf-8'));
  const version = appPkg.version;
  const tagName = `v${version}`;

  console.log(`Preparing to release version: ${tagName}`);

  // 2. Git Tag Prompt
  const tagRes = await prompts({
    type: 'confirm',
    name: 'value',
    message: `Create git tag ${tagName}?`,
    initial: true,
  });

  if (tagRes.value) {
    try {
      // Commit all changes
      console.log('Adding all changes...');
      execSync('git add -A', { stdio: 'inherit' });

      console.log(`Committing changes: chore(release): ${tagName}`);
      execSync(`git commit -m "chore(release): ${tagName}"`, { stdio: 'inherit' });

      console.log(`Creating tag: ${tagName}`);
      execSync(`git tag ${tagName}`, { stdio: 'inherit' });

      const pushRes = await prompts({
        type: 'confirm',
        name: 'value',
        message: `Push tag to remote?`,
        initial: true,
      });

      if (pushRes.value) {
        console.log(`Pushing tag ${tagName} to remote...`);
        execSync(`git push origin ${tagName}`, { stdio: 'inherit' });

        // Also push the commit
        console.log('Pushing commits to remote...');
        execSync('git push', { stdio: 'inherit' });
      }

    } catch (error) {
      console.error('Error creating/pushing git tag:', error);
      process.exit(1);
    }
  } else {
    console.log('Tag creation cancelled.');
  }

  console.log('\nRelease process completed!');
}

main().catch(console.error);
