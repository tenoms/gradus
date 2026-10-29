# 知序 Study · Web 学习系统

数学与计算机小程序资源的统一学习空间。学习者使用独立 Web 账号，按需读取题库、解析、课程、测评、院校与资料；答案、收藏、笔记、计划和进度由 Web 系统持有。可选关联本人小程序账号，单向导入已有学习积累。

## 本地运行

使用 Node.js 24（最低 22.13）及 PostgreSQL 14+。运行时版本记录在 `.node-version`，依赖由 `package-lock.json` 锁定。

```sh
cp config/local.example.json config/local.json
# 填写 runtime.database.url、YYB 地址及所需平台秘密
npm ci
npm run dev
```

- [学习空间](http://127.0.0.1:5173/learn/)
- [管理空间](http://127.0.0.1:5173/admin/)

首次进入管理空间创建管理员，再配置 YYB 服务和系统账号池，并创建学习账号；也可在管理端开启访客注册。管理与学习会话独立，管理员进入学习空间时单独登录。

```sh
npm run build
npm start
```

生产构建由同源 Express 服务提供，默认地址为 [http://127.0.0.1:3001/learn/](http://127.0.0.1:3001/learn/)。监听、数据库池、会话、缓存与超时从配置文件读取；`HOST`、`PORT` 等环境覆盖继续有效。HTTPS 部署设置安全 cookie，反向代理保留原 Host。文件用途、优先级和更新方式见[系统配置](config/README.md)。

## 主要能力

| 空间 | 能力 |
| --- | --- |
| 数学 | 教辅与真题、个人书架、题干与解析、专辑与模型训练、课程、测评、答疑、笔记与复习 |
| 计算机 | 五科章节与练习组、逐题练习与试卷、作答报告、解析、课程录播与弹幕、院校、社区 |
| 个人学习 | 跨设备学习计划、目标与活动，独立收藏、错题、笔记、历史记录和备份 |
| 管理 | 用户与注册、多个 YYB 服务及共享账号池、平台配置、公共资源管理、审计与运行诊断 |

小程序支付、直播与客服不在本项目范围内。

## 数据与同步

PostgreSQL 分为两个数据域：默认 `study_web` 保存 Web 用户、会话、配置及个人学习记录，`study_upstream` 保存已访问的资源响应、实体和媒体引用。`STUDY_SCHEMA_PREFIX` 可修改 schema 前缀。

公共资源优先从本地数据库读取；缺失或过期时，为当前学习请求自动调度系统 YYB 账号池补齐。开启管理端“资源渐进同步”后保存本次实际返回的内容。浏览目录保存目录，打开题目或解析时再保存对应内容；不会遍历全书、预抓下一题或自动下载视频。关闭同步保留旧资源，仍可正常学习。

目录加载会合并并发请求并短期复用稳定目录，题目、播放器及其他栏目模块随访问加载。完整资源入库与个人记录归属不受前端缓存影响。

个人中心可关联本人微信账号，明确选择同步范围后导入已有记录。个人同步与公共资源同步使用独立开关，均从小程序接口向 Web 读取；Web 答案、笔记和进度不回写小程序。

平台初值从 `config/defaults.json`、本机 `config/local.json`（或 `STUDY_CONFIG_FILE` 指定的文件）及环境变量读取，随后以数据库中的管理配置为准。公开地址与默认学科等集中在 `config/public.json`，秘密只在服务端保存。原小程序目录与 `yyb.txt` 属于开发资产，启动、构建和真实验收均不读取它们。

## 源码组织

```text
src/app/             学习、管理入口与路由装配
src/features/        math、computer、admin、identity、learning 业务模块
src/shared/          通用请求、会话、UI、富文本与媒体
server/app.mjs       服务端模块装配
server/modules/      身份、账号池、资源、学习、个人同步与管理
server/integrations/ YYB 与两科平台协议、配置和策略
server/infrastructure/ PostgreSQL、错误类型及运行诊断
shared/              两端共用的领域校验
config/              默认配置、公开配置与本机部署模板
tests/unit/          按业务分类的单元与交互契约测试
tests/integration/   使用独立 PostgreSQL schema 的集成测试
tests/support/       测试数据库与 HTTP 应用夹具
scripts/checks/      仓库依赖与生产构建验证
scripts/live/        真实 YYB 接口验收
scripts/maintenance/ 生成物清理
docs/                现行架构与运行说明
docs/history/        按日期归档的迁移和验收记录
```

模块依赖规则、日常维护与验证流程见[开发指南](CONTRIBUTING.md)及[代码架构](docs/architecture.md)。

## 验证与维护

```sh
npm run check             # 结构、类型、全部测试与构建依赖检查
npm run build             # 生成可运行生产构建
npm run verify:directories # 真实只读目录验收，需要有效 YYB 配置
npm run clean             # 清理 dist 与 TypeScript 增量产物
npm run clean:reports     # 同时清理 artifacts 内本机验收产物
```

自动化测试在各自独立的 PostgreSQL schema 中运行并清理，CI 提供临时数据库。真实接口验收使用本机配置和现有账号，应按[开发指南](CONTRIBUTING.md)选择对应入口。

当前说明以源码和现行文档为准；旧测试数量、迁移清单及阶段实测集中在[文档索引](docs/README.md)下的历史档案中。
