# 系统配置

项目只有一份受版本管理的配置文件：[system.json](system.json)。部署连接保存在 `.env`，平台集成由管理端保存到 PostgreSQL。原小程序源码、`yyb.txt` 和历史验收材料属于开发资产，不参与配置读取。

## 配置入口

| 入口 | 内容 | 生效方式 |
| --- | --- | --- |
| `system.json.runtime` | HTTP、开发服务、数据库池、会话、缓存、超时和诊断默认值 | 修改后重启相应进程 |
| `system.json.public` | 外部打印地址、播放器 SDK、默认科目及浏览器目录缓存参数 | 修改后重新构建前端 |
| `system.json.initialPlatforms` | 首次安装使用的非秘密平台模板 | 仅在数据库尚无平台配置时使用 |
| `.env` | 数据库连接和少量部署覆盖项 | 修改后重启相应进程；不提交 |
| 管理端数据库 | 实际平台地址、启用状态、App ID、站点、YYB 服务与各类密钥 | 通过管理空间保存，按当前配置处理后续请求 |

`system.json` 的所有分组都只能保存非秘密值。数据库 URL、YYB API Key、OCR 凭据、OAuth 客户端密钥、录播 AES Key/IV 均不得写入该文件。

## 本地运行与部署

```sh
cp .env.example .env
# 填写 DATABASE_URL
npm ci
npm run dev
```

首次进入管理空间创建管理员，在“平台集成配置”中确认两科服务参数并填写所需秘密，在“账号池与资源同步”中维护系统 YYB 服务和账号池。个人中心的小程序账号关联由用户单独维护。

`.env` 支持的配置只有以下五项，示例见[环境变量模板](../.env.example)：

| 变量 | 用途 | 默认值 |
| --- | --- | --- |
| `DATABASE_URL` | PostgreSQL 连接 URL | 由部署环境提供 |
| `HOST` | Web API 监听地址 | `runtime.http.host` |
| `PORT` | Web API 监听端口 | `runtime.http.port` |
| `COOKIE_SECURE` | 安全 cookie，接受 `0`、`1`、`false`、`true` | `runtime.session.secureCookies` |
| `STUDY_SCHEMA_PREFIX` | Web 与资源 schema 的共同前缀 | `runtime.database.schemaPrefix` |

运行默认值来自 `system.json.runtime`，对应的部署环境变量可覆盖上述四个默认项。数据库连接通过 `DATABASE_URL` 提供。平台配置统一通过管理端维护，没有本机 JSON 覆盖文件或平台环境变量入口。

## 运维默认值

`runtime` 按以下职责分组，完整字段以 `system.json` 为准：

- `http`：监听地址、端口、JSON/上传大小及哈希静态资源缓存。
- `development`：Vite 监听地址、端口与文件访问限制；API 代理地址由服务端监听配置推导。
- `database`：schema 前缀、连接池大小及连接超时。
- `session`：会话有效期和安全 cookie。
- `resources`、`accounts`：公共资源有效期、YYB 目录复用和账号分配有效期。
- `upstream`、`diagnostics`：外部请求/头像超时和诊断保留条数。

## 平台配置

`initialPlatforms` 为新数据库提供数学与计算机的公开预设，秘密字段由服务端初始化为空。首次安装后，`platform_configuration` 保存实际平台配置，`yyb_services` 保存独立 YYB 服务配置。后续修改模板不会覆盖数据库已有值，已清空的秘密也不会从模板恢复。

管理端维护数学 OCR 地址和用户名/密码、计算机 OAuth 客户端配置及录播 AES Key/IV。录播 Key/IV 需要 16 字节 UTF-8 值。YYB 服务的地址、可选 API Key 与启用状态统一在系统 YYB 服务列表维护。

数学站点由服务端按数据库当前配置注入请求。`public.math.printStationId` 是外部打印服务的独立参数。浏览器通过 `src/shared/config/public.mjs` 读取 `public` 分组。

真实接口验收先通过部署数据库连接读取已有的 `platform_configuration` 快照，再注入独立临时数据库；没有配置记录时提示先在管理端配置。验收脚本不再维护另一份平台配置。

API 路径、字段名、协议编码、业务枚举及算法常量由代码定义。新增配置应归入上述现有入口，并补充对应校验。
