import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import prompts from 'prompts';

const rootDir = process.cwd();
const appPackagePath = path.join(rootDir, 'packages/app/package.json');
const releaseDir = path.join(rootDir, 'release');

function getVersion() {
  if (!fs.existsSync(appPackagePath)) {
    throw new Error(`Could not find ${appPackagePath}`);
  }
  const pkg = JSON.parse(fs.readFileSync(appPackagePath, 'utf-8'));
  return pkg.version;
}

async function triggerRelease() {
  try {
    const version = getVersion();
    const tagName = `v${version}`;

    console.log(`🚀 正在准备触发 GitHub Release Workflow: ${tagName}`);

    // 检查本地是否有该 tag
    try {
      execSync(`git show-ref --tags ${tagName}`, { stdio: 'ignore' });
    } catch (e) {
      console.error(`❌ 本地未找到 tag: ${tagName}，请先运行 bun run release:git`);
      process.exit(1);
    }

    // 检查远程是否有该 tag
    console.log(`🔍 检查远程 tag: ${tagName}...`);
    try {
      execSync(`git ls-remote --exit-code --tags origin ${tagName}`, { stdio: 'ignore' });
    } catch (e) {
      console.error(`❌ 远程仓库未找到 tag: ${tagName}，请先推送到远程`);
      process.exit(1);
    }

    const confirm = await prompts({
      type: 'confirm',
      name: 'value',
      message: `是否确认触发 GitHub Actions 中的 Release 构建流水线 (${tagName})?`,
      initial: true,
    });

    if (!confirm.value) {
      console.log('取消操作');
      return;
    }

    console.log(`📡 正在通过 gh cli 触发 workflow_dispatch...`);
    execSync(`gh workflow run release.yml -f tag=${tagName}`, { stdio: 'inherit' });
    
    console.log(`\n✅ 已成功触发 Release 构建流水线！`);
    console.log(`🔗 你可以前往 GitHub Actions 查看进度: https://github.com/ATQQ/echo-trails/actions/workflows/release.yml`);
  } catch (error: any) {
    console.error(`❌ 触发失败:`, error.message);
  }
}

async function downloadAssets() {
  try {
    const version = getVersion();
    const tagName = `v${version}`;

    console.log(`🔍 正在拉取 Release 资源列表: ${tagName}...`);
    
    let assetsJson;
    try {
      assetsJson = execSync(`gh release view ${tagName} --json assets`, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
    } catch (e) {
      console.error(`❌ 未找到 Release 或 Tag: ${tagName}，可能构建尚未完成。`);
      return;
    }

    const { assets } = JSON.parse(assetsJson);

    if (!assets || assets.length === 0) {
      console.log(`⚠️ 该 Release 暂无构建产物，请等待 GitHub Actions 完成构建。`);
      return;
    }

    const choices = assets.map((asset: any) => ({
      title: `${asset.name} (${(asset.size / 1024 / 1024).toFixed(2)} MB)`,
      value: asset.name,
      selected: true
    }));

    const response = await prompts({
      type: 'multiselect',
      name: 'selectedAssets',
      message: '请选择要下载的资源 (空格选中/取消，回车确认):',
      choices,
      instructions: false,
    });

    if (response.selectedAssets && response.selectedAssets.length > 0) {
      if (!fs.existsSync(releaseDir)) {
        console.log(`📁 创建目录: ${releaseDir}`);
        fs.mkdirSync(releaseDir, { recursive: true });
      }

      console.log(`📥 开始下载到: ${releaseDir}`);
      for (const assetName of response.selectedAssets) {
        console.log(`-> 正在下载 ${assetName}...`);
        execSync(`gh release download ${tagName} -p "${assetName}" -D "${releaseDir}" --clobber`, { stdio: 'inherit' });
      }
      console.log(`\n✅ 下载完成！产物位于: ${releaseDir}`);
    } else {
      console.log('未选择任何资源。');
    }
  } catch (error: any) {
    console.error(`❌ 下载失败:`, error.message);
  }
}

const action = process.argv[2];

async function main() {
  // 检查 gh cli 是否已登录
  try {
    execSync('gh auth status', { stdio: 'ignore' });
  } catch (e) {
    console.error('❌ gh cli 未登录，请先运行 gh auth login');
    process.exit(1);
  }

  if (action === 'trigger') {
    await triggerRelease();
  } else if (action === 'download') {
    await downloadAssets();
  } else {
    console.log('使用方法:');
    console.log('  bun run scripts/gh-release.ts trigger  - 触发 GitHub Actions 构建');
    console.log('  bun run scripts/gh-release.ts download - 选择并下载构建产物');
  }
}

main().catch(console.error);
