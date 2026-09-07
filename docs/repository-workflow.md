# Dual-Repository Workflow

The project is maintained in two GitHub repositories:

- `origin`: private production repository, `EastsCloud/puyan-capital`; this is the Render deployment source.
- `portfolio`: public showcase repository, `EastsCloud/puyan-capital-demo`.

## Update procedure

1. Develop, test, and commit on the local `main` branch.
2. Before every push, confirm that no `.env`, API token, password, database, upload, or real business record is tracked.
3. After verification, push the same commit to the private repository and then the public mirror:

```bash
git push origin main
git push portfolio main
```

4. Render remains connected only to `origin`; the public repository is not the production deployment source.
5. If an update contains non-public material, split the commit or move the material out of version control before synchronizing repositories.

## Pre-push checks

```bash
git status --short
git diff --check
git grep -n -i -E "api[_-]?key|token|password|secret"
```

The final command will also find field names and deliberate test placeholders. Review every match and confirm that none is a real credential.
