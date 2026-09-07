# 双仓库维护说明

项目同时维护两个 GitHub 仓库：

- `origin`：私有正式仓库 `EastsCloud/puyan-capital`，连接 Render 正式演示部署。
- `portfolio`：公开求职仓库 `EastsCloud/puyan-capital-demo`，用于作品集展示。

## 更新规则

1. 所有开发、测试和提交先在同一条本地 `main` 分支完成。
2. 提交前检查不得包含 `.env`、API Token、密码、数据库、上传文件或真实业务数据。
3. 完成测试后，先推送私有仓库，再推送公开仓库：

```bash
git push origin main
git push portfolio main
```

4. Render 仅连接私有 `origin` 仓库；公开仓库不作为正式部署来源。
5. 如果某次更新包含不能公开的资料，不得直接双推；应先拆分提交或将敏感资料移出版本控制。

## 发布前检查

```bash
git status --short
git diff --check
git grep -n -i -E "api[_-]?key|token|password|secret"
```

最后一条会包含示例字段和测试假值，需要人工确认匹配内容不是真实凭证。
