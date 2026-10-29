# 开发指南

## 环境与日常流程

使用 `.node-version` 指定的 Node.js 24、`npm ci` 和 PostgreSQL 14+。复制 `.env.example` 为 `.env` 并填写数据库与实际接口参数，通过 `npm run dev` 启动开发服务。未由环境接管的平台字段也可在首次创建管理员后通过管理空间维护。系统通用参数统一放在 `config/system.json`，各入口职责及覆盖规则见[系统配置](config/README.md)。

提交前运行：

```sh
npm run check
npm run build
```

`check` 依次验证源码层次与本地引用、TypeScript、所有单元/集成测试以及生产构建依赖图。GitHub Actions 使用相同命令和临时 PostgreSQL 16；自动检查不访问真实 YYB 账号。测试进程创建随机命名的两个 schema，并在结束后清理，不使用业务 schema 存放夹具。

## 放置代码

- `src/app` 负责应用入口、导航和路由装配。具体学习页面及行为放在 `src/features` 对应业务目录。
- 同一功能的 UI、模型、请求适配和样式就近存放。跨功能共用且不依赖业务的实现才进入 `src/shared`。
- `server/modules` 按数据归属和业务职责组织，模块内部的路由与持久化实现相邻；外部协议进入 `server/integrations`，数据库及错误原语进入 `server/infrastructure`。
- `shared` 只承载需要在浏览器和服务端共同执行的领域规则。

不要建立只转发另一个文件的兼容壳。调整路径时同时更新源码、测试读取路径、HTML 入口、验证脚本和现行文档。依赖规则由 `npm run verify:repo` 执行，完整说明见[代码架构](docs/architecture.md)。

## 测试

`npm test` 递归发现 `tests/**/*.test.mjs`。不需要数据库的测试位于 `tests/unit/{math,computer,shared,server}`；使用数据库及 HTTP 夹具的用例位于 `tests/integration`。共享夹具位于 `tests/support`。

针对修改的行为选择测试：纯领域转换验证输入/输出，接口测试核对身份、状态和持久化效果。组织调整仍须保留已有用例语义；删除已退出产品的代码时，可同时删除只验证该废弃行为的用例。

## 真实接口验收

这些命令按显式环境变量优先、否则使用管理端值的规则读取平台配置，再注入独立临时 schema，使用真实账号验证。完整 `.env` 可直接用于联调，无需先在管理端保存配置；脚本不修改业务库配置。原始证据写入 Git 忽略的 `artifacts/`。

| 命令 | 范围 |
| --- | --- |
| `npm run verify:directories` | 目录读取、持久化、复用、失效及并发性能；源学习写入为零 |
| `npm run verify:tokens` | 两科认证有效期、复用与续期；源学习写入为零 |
| `npm run verify:system-yyb` | 多 YYB 访问路径、共享账号池与注册；源学习写入为零 |
| `npm run verify:personal-sync` | 本人身份关联、预览及单向个人记录导入 |
| `npm run verify:data-architecture` | 资源与个人记录隔离、作答及报告；包含数学源空练习创建，运行前阅读脚本末尾 `sourceEffects` 记录 |

真实验收与自动化夹具测试分别记录结果。外部服务业务失败不能记为线上通过。

## 生成物与历史

`dist/`、`artifacts/`、`coverage/`、日志及 TypeScript 增量文件由工具生成，不提交。`npm run clean` 删除可重建的生产和类型构建产物；`npm run clean:reports` 还会删除原始本机验收产物，需保留的报告先另行归档。

`.env`、本机旧状态、YYB 凭据与原小程序参考材料均不提交。`config/system.json` 的 `runtime` 和 `public` 只保存通用非秘密参数，不存提供商域名或 App ID；实际平台参数和秘密由 `.env` 或管理端维护，环境字段优先且在界面标明来源。新增配置应使用现有入口并补充相应校验。开发资产不参与配置读取。清理历史材料时先确认运行时引用和数据归属，对唯一证据或状态做可恢复归档。现行说明放在 `docs/`，已完成的迁移和验收材料放在 `docs/history/<日期>/` 并由索引说明适用版本。
