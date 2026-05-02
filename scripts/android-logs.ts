import { execSync, spawn } from 'child_process';
import prompts from 'prompts';

async function main() {
  try {
    // 获取设备列表
    const output = execSync('adb devices').toString();
    const lines = output.split('\n').map((line) => line.trim()).filter((line) => line !== '');

    // 第一行通常是 "List of devices attached"
    const devices = [];
    for (let i = 1; i < lines.length; i++) {
      const match = lines[i].match(/^(\S+)\s+(device|offline|unauthorized)/);
      if (match && match[2] === 'device') {
        devices.push(match[1]);
      }
    }

    if (devices.length === 0) {
      console.error('❌ 未找到已连接的 Android 设备，请检查 USB 连接或运行 adb devices');
      process.exit(1);
    }

    let targetDevice = devices[0];

    if (devices.length > 1) {
      const response = await prompts({
        type: 'select',
        name: 'device',
        message: '发现多个设备，请选择要查看日志的设备：',
        choices: devices.map((d) => ({ title: d, value: d })),
      });

      if (!response.device) {
        console.log('已取消');
        process.exit(0);
      }
      targetDevice = response.device;
    }

    console.log(`✅ 已选择设备: ${targetDevice}`);
    console.log(`🚀 开始监听日志 (RustStdout/RustStderr)...`);
    console.log(`提示: 如果想查看包含特定关键字的日志，可以按 Ctrl+C 退出后，手动执行: adb -s ${targetDevice} logcat | grep "你的关键字"`);
    console.log('--------------------------------------------------');

    // 默认查看 RustStdout, RustStderr，或者也可以直接过滤包名
    // 如果想要看当前应用的全部日志，先获取 PID
    console.log('⏳ 正在获取应用 PID...');
    const appPackage = 'com.echo_trails.app'; // 替换为你的应用包名
    let pid = '';
    try {
      pid = execSync(`adb -s ${targetDevice} shell pidof ${appPackage}`).toString().trim();
    } catch (e) {
      // 忽略错误，可能应用未运行
    }

    const adbArgs = ['-s', targetDevice, 'logcat'];

    if (pid) {
      console.log(`✅ 找到运行中的应用 ${appPackage} (PID: ${pid})`);
      adbArgs.push(`--pid=${pid}`);
    } else {
      console.log(`⚠️ 未检测到运行中的 ${appPackage}，将回退到全局过滤 Rust 日志。`);
      console.log(`提示：请确保应用已经在前台运行。`);
      adbArgs.push('-s', 'RustStdout', 'RustStderr', 'echo_trails');
    }

    const adbProcess = spawn('adb', adbArgs, {
      stdio: 'inherit',
    });

    adbProcess.on('close', (code) => {
      process.exit(code || 0);
    });

    process.on('SIGINT', () => {
      adbProcess.kill('SIGINT');
      process.exit(0);
    });

  } catch (error) {
    console.error('❌ 执行失败:', error);
    process.exit(1);
  }
}

main();
