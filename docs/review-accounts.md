# isater 同事评审账号

以下账号只适用于交付包内的本机演示数据库。

| 角色 | 用户名 | 演示密码 |
|---|---|---|
| 系统管理员 | `dev.admin` | `Isater-Admin-Active-2026` |
| 决策委员会 | `committee.chen` | `Isater-Committee-Active-2026` |
| 执行小组（提交人） | `execution.li` | `Isater-Execution-Active-2026` |
| 执行小组（复核人） | `execution.wang` | `Isater-Reviewer-Active-2026` |

评审人员应测试真实退出和重新登录、角色边界、管理员重置密码及用户自行修改密码。

生产部署时不得继续使用这些账号密码。系统管理员应重新建立生产用户，首次登录强制改密，并删除或停用全部演示账号。
