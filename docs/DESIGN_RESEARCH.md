# French Shell 界面与 D指导素材研究

日期：2026-10-03。本文记录页面参考、当前落地与后续建议，三者分开说明。遵照用户要求：角色必须使用网络上已经存在的 DeepSeek 娘 / 蓝色大肥鱼形象，不自行生成替代角色。页面内统一称呼「D指导」。

## 1. 页面要解决什么

French Shell 是每天可以打开的学习工具，不是卖软件的营销落地页。主任务应是查词、看词卡、留生词，而不是看大标题、功能广告和装饰卡片。

当前沿用蓝白学习桌面，但已压缩介绍区和标题层级，让搜索、词卡与生词操作优先。文案改为简短口语，角色根据真实操作切换姿态。不能把“换了配色、加了角色”当成已经彻底消除 AI 生成感，仍需用户试用验证。

## 2. 真实产品的参考

以下依据官网内容和设计文章做资料研究；没有把未能访问的页面当作已完成视觉评测，也不下载或复制其品牌插画。

| 来源 | 可学习的方向 | 本项目的转化建议 |
| --- | --- | --- |
| [Duolingo 角色设计文章](https://blog.duolingo.com/building-character/) | 一组一致的角色能服务产品叙事，不是一次性的首页插图 | D指导保持同一形象，多姿态表达等待、讲解和完成 |
| [Duolingo 造型语言](https://blog.duolingo.com/shape-language-duolingos-art-style/) | 幽默、夸张与故事性构成角色表达 | 用现成角色的动作回应具体行为，而非套话气泡；不照搬 Duo |
| [Memrise 官网](https://www.memrise.com/) | 把听到的语言、含义与实际说法连起来 | 词卡突出例句和点击朗读；目前不冒充有真人视频或跟读评分 |
| [Lingvist 自定义词库](https://lingvist.com/custom-decks/) | 词汇内容与个人需要结合 | 生词本是核心工作区，不用虚构课程数、等级或学习成绩 |
| [Lawless French](https://www.lawlessfrench.com/) | 法语语法、发音、词汇等分区清楚 | 词卡按真正的教学结构分层，让词形分析与例句容易找到 |

这是我们的设计推论，不是这些网站对 French Shell 的背书。WordReference 页面本次访问被拒绝，未用于具体布局判断。

## 3. 如何降低 AI 生成感

### 页面结构

- 第一屏先给搜索框和能读懂的结果，不用长篇愿景文案。
- 稳定的查词、生词本、设置三入口；不堆“功能亮点”卡片。
- 词卡用字典式排版：原形/音标 → 核心释义 → 输入形式 → 语法/变位 → 例句。
- 出结果后自动压缩首页介绍和角色区域，长词卡仍保持阅读空间。
- 设置像工具配置，不像问卷或营销页；密钥状态、权限错误和当前词库位置要清楚。

### 视觉与文字

- 保留一个主蓝色和纸白底色，细分隔线、稳定间距、少量重点色；避免每块内容都是相同圆角大卡片。
- 中文操作明确、简短；法语用于真实词条和少量角色台词，不堆无意义的英文/法文装饰小标题。
- 不虚构每日任务、连胜、进度条、用户头像或统计数字。
- D指导可以带一点“吃白饭”的嘴硬梗，但不能嘲讽用户的法语水平、掩盖网络错误或给错误信息乱庆祝。
- 不对每个动作都输出“慢慢来/你已经很棒”式套话；优先描述实际发生了什么。
- 角色动效必须可收起或关闭；尊重 reduced-motion，不能抢走词卡注意力。

当前已落实较口语的标题，结果页隐藏重复介绍与样例，角色反馈不重复词卡正文。按完整桌面浏览器反馈，已移除工作区固定最大宽度，正文与控件提高字号，首页角色随窗口增大，结果页角色改为 120–160px 而不是原先约 65px；窄屏保留单列阅读。角色现在固定高清形象，可隐藏/收起，不再播放循环动画。上面的其他条目仍是持续迭代准则，不代表全部细节已验收。

查词错误保留在输入框下方，直到下次查询；不让关键原因随短暂通知消失。切换主页面回到顶部，避免从长设置页返回后落在内容底部。

## 4. 多形象素材候选：只用现成文件

公开仓库、开源代码与美术许可是三件事。候选清单记录现成文件，但不将“可以浏览/下载”直接写成“可以随代码自由再分发”。

| 项目 | 可研究的现成文件 | 适合的界面状态 | 发布前检查 |
| --- | --- | --- | --- |
| [1190fasheqi/dafeiyu-pet](https://github.com/1190fasheqi/dafeiyu-pet) | sprites/正面.png、侧面.png、背面.png，另有多个尺寸版本 | 基础待机、转向 | 仓库 MIT；具体美术上游授权链未完全说明 |
| [YunYueSama/codex-deepseek-pet](https://github.com/YunYueSama/codex-deepseek-pet) | assets/whale/idle-front.png、portrait.png、expressions.png、actions.png；dense-idle/eat/wave/jump/dance/sneak/sleep.png；spritesheet 系列 | 待机、问候、吃饭、睡觉、完成等 | 自定义署名许可，[素材声明](https://github.com/YunYueSama/codex-deepseek-pet/blob/main/ASSET_LICENSE.md)保留底层角色与参考图权利 |
| [gmskywalker/deepseek-fat-fish-codex-pet](https://github.com/gmskywalker/deepseek-fat-fish-codex-pet) | assets/idle.gif、hover.gif、working.gif、success.gif；deepseek-fat-fish/spritesheet.webp | 待机、互动、查词中、保存成功 | 未找到 LICENSE；个人非商业同人声明不等于明确的项目再分发授权 |
| [xpy12367/codex-pet-DeepSeek-girl](https://github.com/xpy12367/codex-pet-DeepSeek-girl) | previews/idle.gif、failed.gif、jumping.gif、review.gif、waiting.gif、waving.gif 等；spritesheet.webp | 错误、复习、等待、问候 | 未找到明确再分发许可，需要核实 |
| [EDMOK/blue-fish-archive](https://github.com/EDMOK/blue-fish-archive) | assets/deepseek_whale.png/webp、media 与 stickers/manifest.json 收集库 | 立绘、少量梗表情 | README 给出角色作者链及 CC BY-NC-SA 4.0；收集库每一张表情仍须单独确认出处 |

可直接查看的例子：

- [早期研究的正面立绘](https://github.com/1190fasheqi/dafeiyu-pet/blob/main/sprites/%E6%AD%A3%E9%9D%A2.png)
- [表情图集](https://github.com/YunYueSama/codex-deepseek-pet/blob/main/assets/whale/expressions.png)
- [查词中可参考的写笔记动作](https://github.com/gmskywalker/deepseek-fat-fish-codex-pet/blob/main/assets/working.gif)
- [完成时可参考的庆祝动作](https://github.com/gmskywalker/deepseek-fat-fish-codex-pet/blob/main/assets/success.gif)
- [九状态联系表](https://github.com/xpy12367/codex-pet-DeepSeek-girl/blob/main/previews/contact-sheet.png)

早期下载并研究了前四个项目的选定原图；目前界面仅启用并分发 YunYueSama 的高清 actions.png，按上游自定义署名许可保留作者、仓库、完整许可及第三方权利边界。其他文件仅作本地研究存档，不加载、不随仓库发布。收集库中的其他候选未全量下载。固定版本、校验值与具体分发边界见 [素材来源](../ASSET_SOURCES.md)；该选择不能推导为其他候选也已获得再分发授权。

## 5. 当前只启用高清小鱼

根据实测和用户最终要求，角色收敛为一套高清固定姿态，其他形象、动作菜单与自动互动已撤下。

| 触发 | actions.png 零基格号 | 含义 |
| --- | --- | --- |
| 打开页面 / 取消 | 0 | 固定待机 |
| 查词等待 / 打开本地词卡 | 2 | 思考 / 复习 |
| 得到结果 / TTS 播放 | 5 | 讲解，仅表示状态 |
| 收藏/不会保存成功 | 15 | 庆祝 |
| 查询错误 / 未识别 | 9 | 低落，具体原因仍由页面说明 |
| 戳一下 | 10 | 挥手姿态停留 1.5 秒，再回业务状态 |

为什么停用旧动画：重复交互曾重置动画起点；dense 部分帧头脸、尾形及位置本身不连贯，简单调帧率不能解决。高清素材也没有真实的 16 方向环视，不应用表情假装看鼠标。完整桌宠播放器还依赖额外图集和 WebGL 光流，对字典工具并非必要。

当前使用同一 `actions.png` 里的 0、2、5、9、10、15 格；服饰一致，脚底对齐，静态检查未见第二条鲸尾或相邻格泄漏。背景图只渲染一个格，没有经典立绘叠层。所有原文件保持原样，没有补帧、重绘或镜像拼尾巴。

业务状态与临时反馈分开，戳一戳不改气泡文字；连续点击只保留一个恢复计时器，新查询立即取消旧反馈。默认静止，键盘输入和鼠标移动不触发姿态。角色隐藏、收起或页面转后台时暂停剩余反馈时间；不积累随机动作。

只加载一张本机原图，缺图显示文字提示，不换其他画风，不影响查词。动作不请求 LLM/TTS，不增加供应商费用。开发检查页 `src/dev/mascot-audit.html` 可逐格核对原图，不能把单元测试当作真实像素或法语质量验证。

## 6. 本轮之后继续做什么

1. 按实际使用继续打磨词卡密度、变位展开和窄屏阅读，避免为了角色牺牲字典可读性。
2. 当前只分发 actions.png 和两份上游许可存档；如增加其他素材须重新逐文件核对许可与作者链，不能将源码 MIT 套用于美术，也不能宣称底层角色权利已全部解决。
3. 保持角色静止与反馈克制，先保证查词，不重新加入随机动作或自动刷屏。
4. 验收桌面、窄屏、有词条、空词库、失败状态与关闭角色后的布局。
5. 再考虑阅读、听写与跟读，不把未做功能用装饰按钮提前放出来。
