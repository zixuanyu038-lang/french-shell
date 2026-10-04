# French Shell 项目结构

更新：2026-10-03。下面先描述已经存在的实现，再单独列后续建议；不把规划当成现成功能。

## 1. 当前目录

```text
french-shell/
├─ index.html                  页面结构、查词/生词本/设置入口
├─ server.mjs                  本机 HTTP 服务、静态资源与 API 路由
├─ provider.mjs                DeepSeek / OpenAI-compatible 查词适配
├─ tts.mjs                     Qwen HTTP SSE 语音适配
├─ credentials.mjs            本机密钥文件、地址绑定、只读状态
├─ src/
│  ├─ app.js                   页面控制、查词/保存/设置/角色反馈
│  ├─ style.css                学习工作台、词卡、响应式与状态样式
│  ├─ entries.js               通用词条结构、校验、离线演示词卡
│  ├─ lookup.js                查词响应版本 2、纠错/候选校验与演示
│  ├─ lookup-view.js           纠错提示与候选摘要的安全渲染
│  ├─ notebook.js              生词本词性分组、组合筛选与安全渲染
│  ├─ settings.js              非敏感配置预设与持久化字段白名单
│  ├─ storage.js               IndexedDB / 用户 JSON 文件、导入导出
│  ├─ speech.js                Web Audio 播放、停止、取消与状态
│  ├─ stream.js                SSE / NDJSON 增量读取、PCM 转换
│  ├─ lifecycle.js             有界等待、超时与取消辅助
│  ├─ mascot.js                固定角色姿态、单次互动、显示偏好与加载处理
│  ├─ mascot-assets.js         现成素材清单、图集状态坐标与偏好校验
│  ├─ dev/mascot-audit.html    开发用原图姿态检查页，不调用 API
│  └─ local-assets/            仅发布当前图集与两份独立许可，其他研究素材忽略
│     ├─ deepseek-actions.png 唯一启用图集，原图随仓库提供
│     ├─ YunYueSama-LICENSE.txt 上游完整署名许可，不属于源码 MIT
│     └─ YunYueSama-ASSET_LICENSE.md 上游素材说明与第三方权利边界
├─ test/
│  ├─ entries.test.js          词条与静态资源隔离
│  ├─ lookup.test.js           查词状态、数量约束、拼写与候选契约
│  ├─ lookup-view.test.js      纠错/候选显示、选择与 HTML 转义
│  ├─ notebook.test.js         词性分组/筛选、旧备份兼容与 HTML 转义
│  ├─ provider.test.js         请求参数、结构重试、错误与来源
│  ├─ tts.test.js              TTS / SSE / PCM / NDJSON
│  ├─ speech-player.test.js    播放调度、取消和后台保存密钥路径
│  ├─ settings-storage.test.js 配置白名单、词库/文件/权限/超时
│  ├─ credentials.test.js      密钥持久化、隐藏、绑定与删除
│  ├─ mascot.test.js           静态姿态、单次互动、偏好迁移与加载清理
│  ├─ frontend.test.js         页面控制 ID 与模板一致性
│  ├─ release.test.js          图片哈希/尺寸、许可边界、HTTP 图片与凭证隔离
│  └─ static-security.test.js  静态真实路径边界与自定义凭证隔离
├─ docs/
│  ├─ USER_GUIDE.md            用户使用说明
│  ├─ PROJECT_STRUCTURE.md     本文件：架构与扩展位置
│  └─ DESIGN_RESEARCH.md       页面研究、角色素材候选与后续计划
├─ ASSET_SOURCES.md            当前分发素材来源、校验值、署名与许可边界
├─ LICENSE                    源码 MIT 许可证，不覆盖第三方图片
├─ README.md                   项目入口、启动与开发说明
├─ package.json               项目元信息、dev/test 命令
├─ .env.example                环境变量说明，不会自动加载
├─ .gitattributes              文本 LF 换行、图片二进制原样保留
└─ .gitignore                  密钥、个人数据、非发布研究素材忽略
```

没有 React/Vue、构建打包工具或数据库服务器。前端为浏览器原生 JS 模块，后台为 Node.js 内置 HTTP 模块；当前无第三方运行依赖。

## 2. 三条核心流程

```text
查词：页面输入
      → app.js
      → POST /api/lookup
      → 后台按接口地址解析密钥
      → provider.mjs 以 stream 方式调用 LLM
      → 后台边收边转成 NDJSON（delta 事件）
      → 收齐后 lookup.js / entries.js 校验整条 JSON 与词条
      → 后台发出 result 事件
      → 页面显示纠正提示或候选
      → 单条直接显示词卡；多条由用户选择展开
      → 只有点“不会/收藏”才交给 storage.js 保存

朗读：词句/选区点击
      → speech.js 发 POST /api/speech
      → 后台按接口地址解析密钥
      → tts.mjs 调用 Qwen HTTP SSE
      → 后台逐段转成 NDJSON
      → 浏览器将 PCM 调度到 Web Audio
      → 播放结束即释放，不落盘

记住密钥：主动勾选并应用
      → POST /api/credentials
      → credentials.mjs 写本机私有文件
      → 页面只获“已配置 + 绑定信息”
      → 后续供应商请求由后台注入 Key
```

前端和后台共享词条校验函数，不共享密钥内容。后台没有词库 API；生词操作直接在浏览器端或用户选择的文件中完成。

## 3. 存储边界

| 数据 | 位置 | 持久化与迁移 |
| --- | --- | --- |
| 主动保存的词条 | 当前来源的 IndexedDB，或用户选定 JSON | 可导入导出 |
| 文件句柄偏好 | IndexedDB preferences | 依赖该浏览器及用户授权 |
| 模式、模型、接口、音色、语言 | localStorage 字段白名单 | 浏览器保留；不包含 Key |
| 角色显示、收起与动效偏好 | localStorage 独立字段白名单 | 形象固定高清；旧多形象/自动互动字段不再生效；不进入词库备份 |
| 未勾记住的 Key | 页面内存 | 刷新清除 |
| 主动保存的 Key | 系统用户目录 .french-shell/credentials.json | 明文、项目外；可自定义路径 |
| 查词结果与耗时 | 当前页面内存 | 词条只有主动保存才落库；耗时不落库 |
| 音频 | 请求流与 Web Audio 内存 | 不缓存、不写文件 |
| D指导图集及独立许可 | src/local-assets/ | 当前 PNG 和两份许可随仓库发布，无图片外链；其他研究素材忽略 |

当前没有加密密钥柜、后台账号、云同步、服务端词库或共享多用户权限系统。不要把本机代理当成公网产品。

## 4. 后台接口

### POST /api/lookup

请求包含 query 和 config（provider、baseUrl、model、可选 apiKey）。临时 Key 优先；为空时后台寻找对应接口已保存的 Key。

响应是 NDJSON 流：模型边生成边产生 `delta` 事件（`received` 为已累积字符数），最后一条 `result` 事件携带 schemaVersion 2 的完整查词结果、模型来源和本次耗时诊断（含 `firstDeltaMs` 首字到达耗时）。出错时若还没写出首帧就返回对应 HTTP 状态码，否则以一条 `error` 事件结束。上游忽略 stream 直接回 JSON 时，后台同样接受，按单个 delta 处理。

查词外层为 `{schemaVersion:2, query, status, notice, entries}`。query 由本机请求确定，不信任模型回写；status 是 exact / corrected / ambiguous / not_found。exact 有 1–3 条同拼写不同词性的卡，corrected 恰为 1 条更正卡，ambiguous 有 2–3 条不同拼写候选，not_found 没有卡。未识别是 HTTP 200 的业务结果，不是网络错误。

`normalizeLookupResult()` 和 `normalizeEntry()` 使用字段白名单，丢弃模型伪造的来源、耗时及额外字段，再由后台添加可信 source / diagnostics。校验状态、数量、重复和字符串上限，但不能验证法语知识或猜测是否真的符合用户原意。

请求本身不是对话历史。DeepSeek 类型关闭思考并附带 `stream_options` 统计用量，兼容类型省略这两项专有参数。返回字段错误最多重试一次，远程 HTTP 错误不自动重试；重试会重新产生一轮 delta，前端进度随之归零重来。

纠错与所有候选卡使用同一次模型响应，没有预请求。默认单卡；仅必要时输出多个候选，输出 token 上限 4000。前端只在用户选择候选时展开已经返回的卡，不再请求模型；耗时面板属于整次查询，不属于某个候选。

### POST /api/speech

请求包含 text 和 config（endpoint、model、voice、language、可选 apiKey）。Key 同样可由后台解析。成功返回 NDJSON：audio / done / error 事件；浏览器接收 PCM 播放。TTS 不自动重试。

### POST /api/credentials

action 为 status、save 或 delete。save 明确提供 kind、config、apiKey；kind 为 lookup 或 speech。

管理路由强制同源 POST。status 不返回 Key，仅返回是否配置与绑定信息。每一类暂存一份持久密钥；不是多供应商密钥目录。所有本地路由均有 Host 校验及请求体大小限制。

保存的 Key 是本机信任范围内的凭据：同源恶意脚本、本机有权限的进程或操作系统账号攻击，不由此简单代理彻底防护。

## 5. 词条与备份约定

词条和备份仍使用 schemaVersion 1，与新的查词外层版本分开。原形 lemma/ipa 与识别形式 query/queryIpa 分开；纠正后 query 是认可的正确形式，原始错拼仅保留在查词外层的页面内存。partOfSpeech 是枚举；definitions 为中文释义数组；grammar、forms、conjugations、examples、note 组成词卡。

不修改旧词库/备份的字段结构。只有选中词条再主动保存才写入，不把响应外层、其他候选或诊断信息写进生词本。

`notebook.js` 从已保存的 entry.partOfSpeech 派生分组，不新增存储字段、不升级数据库、不额外调用 API。固定分组顺序为名词、动词、形容词、副词、代词、限定词、介词、连词、感叹词、短语，异常值归入其他 / 未分类；仅渲染非空组。文本与词性筛选取交集，文本使用 NFC 和法语小写匹配，保留重音差别。每组按 updatedAt 降序，不修改原记录；页面展示可见数量与总数，清除筛选不会改动数据。

grammar 值为字符串或 null；未知音标等用 null；不适用的词形/变位用空数组。变位必须分别表示 mood 和 tense，不能把语式与时态混成一个字段。

生词记录外层包含 id、entry、unknown、favorite、createdAt、updatedAt。id 根据“规范化法语原形 + 词性”计算。保存的是词卡快照，不是每次打开都重新生成。

备份外层包含 schemaVersion 和 words，导出时还包含 exportedAt；导入容许无 exportedAt，校验所有词条后再合并。导入会重算 ID、移除诊断信息，按 updatedAt 选较新记录。

## 6. D指导模块

`mascot-assets.js` 仅定义高清小鱼的一张 `deepseek-actions.png` 原图：2048×2048、4×4、每格 512×512。所有业务状态都取同一图集里的单格，不再循环播放 dense/story 动画。CSS 背景尺寸为 400%×400%，位置按列/行数减一计算；没有独立立绘层、镜像尾巴或经典图片回退。

`mascot.js` 分开管理业务 `state` 和一次性视觉 `overlay`。默认没有任何动作计时器；仅戳一戳用一个 1500ms 恢复计时器。重复渲染不重播，连续点击替换旧计时器，新业务事件立即取消旧互动。查词/朗读/错误优先于装饰，互动不改气泡文本。

| 应用事件 | 状态 | 图集零基格号 |
| --- | --- | --- |
| 初始待机 | idle | 0 |
| 查词等待 | thinking | 2 |
| 查词成功 | result | 5 |
| 保存成功 | saved | 15 |
| 查词失败/未识别 | error | 9 |
| 用户取消 | cancelled | 0 |
| 打开本地词卡 | review | 2 |
| 朗读期间 | speaking | 5 |
| 点击「戳一下」 | 临时 hello，1500ms 后恢复业务姿态 | 10 |

姿态是状态标识，不是完整逐帧动作或精准口型。没有鼠标环视、随机动作、睡眠、首次自动问候或手选动作菜单。只有一个 sprite DOM 层；图集加载校验实际尺寸，有 5 秒超时与异步版本检查，失败只显示文字提示，查词照常使用。应用设置后可重试失败加载，不无限循环请求图片。

页面隐藏、角色收起或离开查词页时暂停临时反馈的剩余倒计时；返回不重新开始完整时长。新业务事件仍取消旧反馈。`dispose()` 清理计时器、图像加载和监听。只读取本机原图，不发 GitHub 请求、不调用 LLM/TTS。显示偏好独立白名单保存；旧 skin、automatic、lookAtPointer 不再生效，迁移为唯一高清形象，不混进接口配置、密钥或词库。

`src/dev/mascot-audit.html` 是开发用原格检查页，方便核对各姿态与实际图片尺寸，普通应用不加载它。原图未修改、未自行生成；来源版本与许可边界见 [素材说明](../ASSET_SOURCES.md)。

## 7. 后续重构建议（未实现）

先保留当前无构建步骤的简单启动，按需求拆模块，不为拆目录引入大型框架。

- app.js：将词卡渲染、设置控制、角色反馈逐步拆开，避免继续增长成单文件。
- provider.mjs / tts.mjs：真正增加第二种协议时再拆 adapters/；“能改 URL”不等于适配所有协议。
- entries.js：后续把演示 fixtures 与契约分离，便于扩展和测试。
- credentials.mjs：桌面化后考虑操作系统凭据库；当前明文方案保持清楚告知。
- storage.js：需要跨页面/跨设备并发时再设计同步与冲突处理，不假装 JSON 文件自带同步。
- 阅读模块：另建课文数据、分句与朗读队列；是否保存课文/音频需要重新决定，不能静默改变“只存生词”的原则。
- 听写/跟读：分别定义文字校验与录音评估，先确认麦克风权限和数据去向。

## 8. 验证与发布

```sh
node --check server.mjs
node --check src/app.js
node --test
```

测试使用模拟供应商，不需要真实 Key，不证明实际供应商音色质量。页面改动还需浏览器检查查词、窄屏、生词本、设置和失败状态。

源码采用 MIT；当前高清图集另按上游自定义署名许可分发，第三方权利边界见素材清单。发布仅包含本项目目录，不包含上级个人学习资料、个人词库、浏览器配置或私有密钥。下载后安装 Node.js 20+，在项目目录运行 `node server.mjs`；无需构建或另找图片，默认演示模式即可查看页面。真实查词和 TTS 使用各自的 API Key。

发布时应从 Git 跟踪文件生成干净副本，再执行测试和静态资源验证，避免把开发机上未跟踪的文件当成发行依赖。GitHub 托管源码不等于公网部署；当前没有桌面安装包。
