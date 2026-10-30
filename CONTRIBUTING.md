# 开发指南

环境准备、启动和首次配置见 [README](README.md#快速开始)；配置项与生效规则见[系统配置](config/README.md)。本文说明代码组织、验证和维护约定。

## 开发流程

修改后先验证受影响的行为，提交前运行完整检查与构建：

```sh
npm run check
npm run build
```

`check` 包含源码结构与引用检查、TypeScript、全部单元和集成测试，以及生产构建依赖检查。CI 使用 [.node-version](.node-version) 指定的 Node.js 和 PostgreSQL 16，执行相同检查。

## 代码组织

新增功能放入对应业务模块，页面、模型、请求适配和样式就近维护；跨功能通用能力才进入共享目录。共享模块不反向依赖业务，基础设施不依赖平台适配，前后端目录及完整依赖规则见[代码架构](docs/architecture.md)。

调整路径时更新调用方、入口、测试和文档，不保留仅转发旧文件的兼容壳。

## 自动化测试

`npm test` 运行 `tests/**/*.test.mjs`。也可单独验证受影响的文件：

```sh
node --experimental-strip-types --test tests/unit/shared/account-profile.test.mjs
```

- `tests/unit/`：按业务分类的单元与交互测试。
- `tests/integration/`：数据库与 HTTP 集成测试。
- `tests/support/`：共享测试夹具。

集成测试需要可用的 PostgreSQL 连接，读取 `DATABASE_URL`，为每个测试创建独立的临时 schema，结束后清理。自动化测试不访问真实 YYB 账号。

测试应覆盖输入输出、交互结果或接口的身份与持久化行为。重构时保留原有行为验证；删除功能时，可同时移除只验证该功能的用例。

## 真实接口验收

使用有效的 YYB 和学习平台配置，按改动范围选择命令：

| 命令 | 验证范围 |
| --- | --- |
| `npm run verify:directories` | 目录加载、复用、并发与失效 |
| `npm run verify:tokens` | 两科认证复用、续期与恢复 |
| `npm run verify:system-yyb` | 多服务账号合并、切换与注册 |
| `npm run verify:personal-sync` | 本人账号关联、预览与单向记录导入 |
| `npm run verify:resource-local-first` | 已保存资源优先读取、后台更新与来源故障恢复 |
| `npm run verify:resource-reuse` | 题目跨入口复用、完整题组复用与新建个人练习 |
| `npm run verify:data-architecture` | 公共资源与个人记录隔离、作答报告及资源维护 |

脚本按应用的[配置优先级](config/README.md#平台参数的优先级)读取环境变量和管理端设置，在独立的临时 schema 中验证并清理，不修改业务库配置。原始报告保存在 `artifacts/`，自动化测试与真实接口验收的结果分别记录。

这些验收不回写小程序答案或提交小程序试卷，但部分流程会准备题组或创建空练习：

- `verify:resource-local-first` 会按需准备计算机章节题组。
- `verify:resource-reuse` 完整验收会发起一次数学选题，可能留下空练习；仅验证计算机时可运行 `npm run verify:resource-reuse -- --computer-only`。
- `verify:data-architecture` 也可能创建数学空练习。

涉及选题的验收，运行前查看脚本末尾的 `sourceEffects`，并在报告中核对实际影响。外部服务失败应记录为验收失败，不作为通过结果。

## 产物与文档维护

`dist/`、`artifacts/`、`coverage/`、日志和 TypeScript 增量文件属于本机产物，不提交；`.env`、YYB 凭据和个人运行状态同样保留在本机。配置填写与保存位置统一见[系统配置](config/README.md)。

| 命令 | 清理范围 |
| --- | --- |
| `npm run clean` | `dist/` 和根目录的 `*.tsbuildinfo` |
| `npm run clean:reports` | 上述产物，以及整个 `artifacts/` 目录 |

清理前归档需要保留的验收证据。现行文档放在 `docs/`，阶段性验收和迁移记录按日期归入 `docs/history/`；历史记录应注明适用版本，当前行为以源码和现行文档为准。
