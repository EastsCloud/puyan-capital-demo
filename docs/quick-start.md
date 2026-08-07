# isater 同事评审快速启动

## 包内内容

- `system/`：完整 isater 源代码、数据库升级、前端生产构建和测试数据。
- `demo-database/`：截至 2026-08-07 的本机演示数据库快照。
- `docs/`：产品、逻辑、架构、需求、测试和账号说明。
- `RELEASE_STATUS.md`：本版范围和已知生产上线事项。

## 本机运行

### 推荐：Windows 一键启动

双击包根目录的 `start_app.bat`。首次运行会自动准备演示数据库、安装锁定依赖并执行数据库升级；浏览器随后自动打开 `http://localhost:5173/`。使用期间请保持命令窗口开启，按 `Ctrl+C` 或关闭窗口会停止服务。

### 手动启动

1. 安装 Node.js 22 或更高版本及 pnpm 10。
2. 将 `demo-database/` 复制到 `system/apps/api/data/review-pg/`。
3. 在 `system/` 运行 `pnpm install`。
4. 在 `system/apps/api/` 运行 `DATABASE_URL=pglite://data/review-pg pnpm dev`。
5. 在 `system/apps/web/` 运行 `pnpm dev`。
6. 浏览器访问 `http://localhost:5173/`，使用 `docs/review-accounts.md` 中的演示账号。

## EODHD 凭证准备

1. 生产环境先设置至少 32 个随机字符的 `EXTERNAL_CREDENTIAL_ENCRYPTION_KEY`。
2. 以系统管理员登录，在“数据连接”中录入 EODHD API Token。
3. 保存后点击“测试连接”；只有测试返回真实复权价格后才启用。
4. 不要把 EODHD 网站密码、API Token 或加密密钥写入交付文档或前端配置。

## 生产部署提醒

演示数据库仅供评审。生产环境应使用云 PostgreSQL、HTTPS 域名、定时备份、邮件服务和正式数据凭证，并通过全部生产集成测试后再启用业务账号。
