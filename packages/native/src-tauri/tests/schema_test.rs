use tauri_app_lib::db;

/// 逐条执行建表语句，精确定位哪条 SQL 在 Turso 0.5.3 中失败
#[tokio::test]
async fn test_all_schema_statements_succeed() {
    let tmp = std::env::temp_dir().join(format!(
        "echo_trails_schema_test_{}.db",
        uuid::Uuid::new_v4()
    ));
    // 确保是全新文件
    let _ = std::fs::remove_file(&tmp);
    let _ = std::fs::remove_file(format!("{}-wal", tmp.display()));
    let _ = std::fs::remove_file(format!("{}-shm", tmp.display()));

    let path = tmp.to_string_lossy().to_string();
    let db_instance = turso::Builder::new_local(&path)
        .build()
        .await
        .expect("Failed to build test db");
    let conn = db_instance.connect().expect("Failed to connect");

    // 先执行 PRAGMA（与生产代码一致：PRAGMA journal_mode 用 query，因为返回行）
    let _ = conn.query("PRAGMA journal_mode=WAL", ()).await;
    let _ = conn.execute("PRAGMA busy_timeout=5000", ()).await;

    // 逐条执行建表语句，收集失败项
    let mut failures: Vec<(usize, String, String)> = Vec::new();
    let stmts = db::schema_statements();
    for (i, stmt) in stmts.iter().enumerate() {
        match conn.execute(stmt, ()).await {
            Ok(_) => println!("OK  [{:2}] {}", i, first_line(stmt)),
            Err(e) => {
                println!("FAIL[{:2}] {} — {}", i, first_line(stmt), e);
                failures.push((i, first_line(stmt).to_string(), e.to_string()));
            }
        }
    }

    // 清理
    drop(conn);
    drop(db_instance);
    let _ = std::fs::remove_file(&tmp);
    let _ = std::fs::remove_file(format!("{}-wal", tmp.display()));
    let _ = std::fs::remove_file(format!("{}-shm", tmp.display()));

    assert!(
        failures.is_empty(),
        "以下 {} 条建表语句执行失败:\n{}",
        failures.len(),
        failures
            .iter()
            .map(|(i, stmt, err)| format!("  [{}] {} — {}", i, stmt, err))
            .collect::<Vec<_>>()
            .join("\n")
    );
}

/// 验证 create_schema_with_conn 能成功创建所有预期表
#[tokio::test]
async fn test_create_schema_creates_all_tables() {
    let tmp = std::env::temp_dir().join(format!(
        "echo_trails_schema_full_{}.db",
        uuid::Uuid::new_v4()
    ));
    let _ = std::fs::remove_file(&tmp);
    let _ = std::fs::remove_file(format!("{}-wal", tmp.display()));
    let _ = std::fs::remove_file(format!("{}-shm", tmp.display()));

    let path = tmp.to_string_lossy().to_string();
    let db_instance = turso::Builder::new_local(&path)
        .build()
        .await
        .expect("Failed to build test db");
    let conn = db_instance.connect().expect("Failed to connect");

    // 执行完整的 schema 创建
    db::create_schema_with_conn(&conn)
        .await
        .expect("create_schema_with_conn failed");

    // 验证所有预期表都存在
    let expected_tables = [
        "kv_cache",
        "photos",
        "photo_albums",
        "albums",
        "album_folders",
        "asset_categories",
        "assets",
        "memorials",
        "families",
        "weights",
        "blood_pressures",
        "usage_records",
        "sync_log",
    ];

    let mut missing: Vec<&str> = Vec::new();
    for table in &expected_tables {
        let check_sql = format!(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='{}'",
            table
        );
        let mut rows = conn
            .query(check_sql.as_str(), ())
            .await
            .unwrap_or_else(|e| panic!("Failed to query for table {}: {}", table, e));
        match rows.next().await {
            Ok(Some(_)) => println!("✓ 表 '{}' 存在", table),
            Ok(None) => {
                println!("✗ 表 '{}' 缺失!", table);
                missing.push(table);
            }
            Err(e) => {
                println!("✗ 查询表 '{}' 出错: {}", table, e);
                missing.push(table);
            }
        }
    }

    // 清理
    drop(conn);
    drop(db_instance);
    let _ = std::fs::remove_file(&tmp);
    let _ = std::fs::remove_file(format!("{}-wal", tmp.display()));
    let _ = std::fs::remove_file(format!("{}-shm", tmp.display()));

    assert!(
        missing.is_empty(),
        "以下表未被创建: {:?}",
        missing
    );
}

fn first_line(s: &str) -> &str {
    s.lines().next().unwrap_or(s).trim()
}
