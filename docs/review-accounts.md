# Review Account Policy

The public repository does not provide fixed usernames or passwords. An administrator should create temporary accounts for each review environment and share them privately.

Prepare at least four distinct accounts:

| Role | Count | Purpose |
|---|---:|---|
| System Administrator | 1 | User, parameter, and external-data configuration |
| Decision Committee | 1 | Annual target and portfolio approval |
| Execution Team — maker | 1 | Trade implementation, position import, and fill import |
| Execution Team — checker | 1 | Independent review of another execution user's action |

Reviewers should test real logout and login, role boundaries, administrator password reset, forced first-login password change, and the rule that an execution user cannot review their own action.

Production users must be created separately. Never reuse credentials from public documentation, chat messages, or a local demo environment.
