fn embedded_web_version() -> String {
    // Cargo build.rs cwd is the crate dir (packages/native/src-tauri).
    let path = std::path::Path::new("../../app/package.json");
    println!("cargo:rerun-if-changed={}", path.display());
    let Ok(text) = std::fs::read_to_string(path) else {
        return "0.0.0".to_string();
    };
    for line in text.lines() {
        let trimmed = line.trim();
        if let Some(rest) = trimmed.strip_prefix("\"version\"") {
            let rest = rest.trim_start().trim_start_matches(':').trim_start();
            if let Some(value) = rest
                .strip_prefix('"')
                .and_then(|s| s.split('"').next())
                .map(str::trim)
                .filter(|s| !s.is_empty())
            {
                return value.to_string();
            }
        }
    }
    "0.0.0".to_string()
}

fn main() {
    // native-hash.txt 由 scripts/native-hash.ts 在构建前写入（见 before-build.mjs）。
    // 缺失时退化为 "dev"，不影响本地开发。
    println!("cargo:rerun-if-changed=native-hash.txt");
    let hash = std::fs::read_to_string("native-hash.txt").unwrap_or_else(|_| "dev".to_string());
    println!("cargo:rustc-env=NATIVE_HASH={}", hash.trim());

    // commit 同样由 scripts/native-hash.ts 写入：build.rs 里直接 shell out git
    // 在 CI / 沙箱 / 交叉编译环境下拿不到值（会退化成 unknown）。
    println!("cargo:rerun-if-changed=native-commit.txt");
    let commit =
        std::fs::read_to_string("native-commit.txt").unwrap_or_else(|_| "unknown".to_string());
    println!("cargo:rustc-env=NATIVE_GIT_COMMIT={}", commit.trim());

    println!("cargo:rustc-env=EMBEDDED_WEB_VERSION={}", embedded_web_version());
    tauri_build::build()
}
