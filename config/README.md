# 系统配置

系统通用参数放在 [system.json](system.json)，本机真实接口参数放在不提交的 `.env`。平台参数也可在管理端维护，按下述字段级覆盖规则生效。已提交配置不包含小程序提供商的域名、App ID 或凭据，不再提供平台安装模板。

## 从本机开始

现有开发机的 `.env` 已从此前有效配置回填，可直接使用真实接口调试。新环境执行：

```sh
cp .env.example .env
# 填写 DATABASE_URL、STUDY_SCHEMA_PREFIX 和需要由环境控制的接口参数
npm ci
npm run dev
```

完整变量及填写说明见 [.env.example](../.env.example)。平台 API 填根地址，OCR 和播放器 SDK 填完整接口/脚本 URL，数学外部页面填 URL 前缀。不要从 API 地址推导其他服务的地址，它们可能部署在不同主机。录播 AES Key/IV 均需 16 字节 UTF-8 文本。

## 生效规则

对每个可管理的平台字段独立处理：

1. 环境变量已定义：使用环境变量，管理端标明 `.env` 控制并禁止修改这个字段。
2. 环境变量未定义：使用管理端保存的字段，可正常编辑。
3. 两处均未配置：使用空值；全新安装默认关闭两科来源，启用时必须补齐必要连接参数。

环境变量定义为空串也属于显式配置，可清空可选凭据；必填地址、布尔值和编号仍需满足校验。要把字段交回管理端，删除或注释对应环境变量后重启。管理端清空凭据只作用于管理端持有的字段；环境变量中的秘密应修改 `.env`。

环境值不写入配置数据库。修改 `.env` 后重启 `npm run dev` 或 `npm start`；管理端修改未被环境接管的字段后，后续请求立即使用新值。

系统默认 YYB 服务的地址和 API Key 也遵循字段级环境优先规则。新增 YYB 服务由其独立管理记录维护，不受默认服务环境变量覆盖；服务启用状态和账号调度仍在管理端维护。用户个人中心的账号关联独立于系统资源池。

未设置 YYB 环境变量时，管理端新增或编辑服务会写入 `<前缀>_web.yyb_services`；数学与计算机管理配置写入 `<前缀>_web.platform_configuration`。配置不会写回 `.env` 或 `system.json`。默认 YYB 尚未单独保存的字段可继承平台配置中的已有 YYB 值，环境变量只对默认服务的对应字段生效。

## 环境变量

| 分组 | 变量 |
| --- | --- |
| 部署 | `DATABASE_URL`、`HOST`、`PORT`、`COOKIE_SECURE`、`STUDY_SCHEMA_PREFIX` |
| 默认 YYB | `YYB_BASE_URL`、`YYB_API_KEY` |
| 数学 | `MATH_ENABLED`、`MATH_BASE_URL`、`MATH_APP_ID`、`MATH_STATION_ID`、`MATH_LOGIN_ID` |
| 数学 OCR | `MATH_OCR_URL`、`MATH_OCR_USERNAME`、`MATH_OCR_PASSWORD` |
| 计算机 | `COMPUTER_ENABLED`、`COMPUTER_BASE_URL`、`COMPUTER_APP_ID`、`COMPUTER_TENANT_CODE`、`COMPUTER_OAUTH_CLIENT_ID`、`COMPUTER_OAUTH_CLIENT_SECRET` |
| 计算机录播 | `COMPUTER_VIDEO_KEY`、`COMPUTER_VIDEO_IV` |
| 浏览器公开功能 | `MATH_EXTERNAL_URL`、`MATH_PRINT_STATION_ID` |

`MATH_ENABLED`、`COMPUTER_ENABLED`、`COOKIE_SECURE` 接受 `0`、`1`、`false`、`true`。部署监听和安全 cookie 的默认值来自 `system.json.runtime`；数据库连接与 schema 前缀均由部署环境提供，schema 没有隐式默认值。应用连接数据库时必须设置 `STUDY_SCHEMA_PREFIX`，例如 `study` 对应 `study_web` 和 `study_upstream`；前端构建不需要连接数据库。

浏览器公开功能的两个变量只由环境维护。服务端通过现有会话响应白名单发送，不传输平台 API、OCR/OAuth 凭据或录播密钥。无需把秘密放进 `VITE_*`，修改地址后重启服务即可。未配置外部页面时，相关导出功能显示不可用。数学与计算机录播均使用浏览器视频播放器，无需配置播放器 SDK 地址。

## 学习空间主题

管理端“主题与外观”（`/admin/appearance`）分别维护数学和 408 的主题色，并统一设置一个明暗模式。每科支持鸢尾紫、晴空蓝、松石绿、琥珀橙、蔷薇粉；全局明暗模式支持跟随系统、浅色、深色。默认数学为紫色、408 为绿色，明暗跟随系统。管理空间保留紫色，使用同一全局明暗模式。

主题保存在 `<前缀>_web.appearance_settings`，无需环境变量或重启。配置结构为 `{mode,math:{palette},computer:{palette}}`。`GET/PUT /api/admin/appearance` 使用管理身份与 revision 校验；保存会记录操作审计。`GET /api/appearance` 和会话中的 `browserConfig.appearance` 只公开主题枚举。同浏览器的页面通过配置更新与存储事件同步，重新打开、返回前台或刷新时读取服务端设置。

学习端顶栏“主题与外观”分别选择数学与 408 的个人主题色，修改其中一科不会改变另一科；每科也可单独使用管理端默认配色。明暗模式由两科共用，默认沿用管理端，也可选择浅色、深色或跟随系统。所有选择即时生效，各组选项中的管理默认可分别恢复继承；通过关闭图标、Escape 或点击遮罩退出弹窗。个人偏好仅写入浏览器 `localStorage` 的 `study-theme-preference`，结构为 `{mode,math:{palette},computer:{palette}}`，不提交服务器、不随账号同步，也不影响管理端。跟随系统时实时监听系统外观变化；浏览器禁止存储时仍可临时切换并明确提示未保存。

浅色和深色共享文字、表面、边框、主题与状态颜色变量；课程媒体保持适合播放的深色底。确认、输入与提示统一使用应用内弹窗，支持键盘取消、焦点管理与背景交互隔离。

未选中导航的文字与图标共用随当前配色柔和调整的前景色，悬停和选中状态才使用强调色。题干、解析、课程介绍和表单内容使用中性正文色；正确、错误及操作反馈分别使用语义状态色。视频弹幕的描边和独立打印报告的浅色纸面属于保留的内容呈现色，不随应用配色重绘。

富文本中上游编辑器的普通内联文字与背景色归入当前阅读主题，链接、重点标记、引用和代码继续使用对应的主题样式；KaTeX 公式保留表达数学关系所需的语义配色与布局。

## 系统文件与验证

`system.json.runtime` 保存 HTTP、开发服务、数据库池、会话、缓存、超时和诊断默认值；`public` 保存科目和浏览器目录缓存等通用参数。修改系统参数后重启相应进程，修改静态前端参数后重新构建。

真实接口验收按应用相同规则合并 `.env` 与管理配置，选择启用的 YYB 来源，再注入独立临时数据库。只要 `.env` 足够完整，即使没有保存过平台配置也能验收。脚本不修改部署数据库，不读取原小程序目录或 `yyb.txt`，原始报告保存在忽略的 `artifacts/`。

API 路径、字段名、协议编码、业务枚举及算法常量由代码定义。新增配置归入现有入口，不增加本机 JSON 或另一套平台默认文件。
