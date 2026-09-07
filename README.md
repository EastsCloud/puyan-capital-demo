# Puyan Capital Investment Control Center

这是一个面向小型投资团队的投资管理与治理系统演示项目。项目覆盖从年度公开数据、目标收益、资产分层、拟投资组合、历史回测、优化、委员会审批、交易实施，到监控、非股票净值和报告归因的完整流程。

在线演示：[demo.puyancapital.com](https://demo.puyancapital.com)

> 本仓库用于作品集展示和技术交流，不构成投资建议，也不应直接作为生产交易系统使用。在线演示账号和数据凭证不存放在代码仓库中。

## 主要能力

- 三角色权限：系统管理员、决策委员会、执行团队
- 年度投资流程及状态控制
- EODHD 等外部数据适配与数据来源留痕
- 分市场组合构建、Beta/回撤检查、历史回测与优化
- 委员会审批、执行双人复核和不可变审计记录
- 持仓、成交回单及外部现金流 CSV 导入
- 成交导入预览、勾选、证券代码识别与计划差异核对
- 版本化参数、报告归因、发送记录与数据导入台账
- 中英文、桌面端和移动端响应式界面

## 技术结构

- Web：React 19、TypeScript、Vite
- API：Node.js、Fastify、Zod
- 数据库：PostgreSQL、版本化 SQL migration
- 安全：Argon2id 密码、HttpOnly 会话、服务端权限校验、AES-256-GCM 外部凭证加密
- 工程：pnpm workspace、Vitest、Render 部署配置

```text
system/
  apps/web/          React 前端
  apps/api/          Fastify API、认证、流程和外部数据适配
  packages/domain/   独立业务规则与权限策略
  db/migrations/     PostgreSQL 数据库迁移
docs/                产品、架构、业务流程和测试文档
```

更完整的设计说明见 [架构文档](docs/architecture.md) 和 [业务流程](docs/business-flow-and-logic.md)。

## 本地运行

要求 Node.js 22+、pnpm 10，并准备 PostgreSQL。

1. 将 `system/.env.example` 复制为 `system/.env`，填写仅供本机使用的配置。
2. 在 `system/` 运行 `pnpm install`。
3. 运行 `pnpm --filter @isater/api migrate`。
4. 按 `docs/quick-start.md` 启动 API 和 Web。

任何 API Token、管理员初始密码、生产数据库地址和加密密钥都只能通过环境变量或管理页面配置，不得提交到 Git。

## 验证

在 `system/` 中运行：

```bash
pnpm check
```

该命令依次执行类型检查、自动化测试和生产构建。人工验收范围及当前边界见 [发布状态](RELEASE_STATUS.md)。

## 仓库说明

- 本公开仓库用于求职作品集展示。
- 正式部署继续由私有仓库维护，公开仓库不保存生产环境变量、真实账户、真实持仓或客户数据。
- 双仓库同步约定见 [仓库维护说明](docs/repository-workflow.md)。

## 使用限制

源码仅供查看、评审和作品集展示。除非仓库所有者另行授权，不授予复制、再发布或商业使用权。
