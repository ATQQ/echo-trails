---
alwaysApply: true
---
## Android Development
- **JNI & ProGuard**: When adding or modifying JNI methods in `MainActivity.kt` (or any other Java/Kotlin class accessed via Rust), you MUST explicitly add `-keep` rules in `packages/native/src-tauri/gen/android/app/proguard-rules.pro`.
  - This applies to both the method names (e.g., `getFileInfo`) and any data classes (e.g., `FileInfo`) returned to Rust.
  - Failure to do so will cause the app to crash or malfunction in Release builds due to obfuscation.

## General
- **Code Style**: Follow the existing code style in the project.