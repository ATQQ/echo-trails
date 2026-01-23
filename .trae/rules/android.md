---
alwaysApply: true
---
## Android Development
- **JNI Architecture**:
  - **Helper Classes**: Do not put business logic in `MainActivity.kt`. Create separate Kotlin `object` helpers (e.g., `FileHelper`, `AppHelper`) with `@JvmStatic` methods.
  - **Class Loading**: In Rust JNI, use the context's `ClassLoader` to load these app classes (via `loadClass`), as `env.find_class` often fails for non-system classes in JNI threads.
- **ProGuard Rules**:
  - When adding new JNI methods or data classes, you **MUST** explicitly add `-keep` rules in `packages/native/src-tauri/gen/android/app/proguard-rules.pro`.
  - Keep the class, its methods, and any data classes (e.g., `FileInfo`) accessed by Rust to prevent obfuscation crashes in Release builds.

## General
- **Code Style**: Follow the existing code style in the project.
