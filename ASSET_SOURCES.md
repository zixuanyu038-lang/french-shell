# D指导角色素材与发布清单

French Shell 使用网络上已经存在的 DeepSeek 娘 / 蓝色大肥鱼，页面称呼「D指导」。本项目没有自行生成或重新设计角色，与 DeepSeek 及素材作者无隶属关系，也不代表官方背书。

## 随仓库分发的唯一图片

- 文件：`src/local-assets/deepseek-actions.png`
- 作者：YunYueSama
- 仓库：https://github.com/YunYueSama/codex-deepseek-pet
- 固定来源提交：`7661c8b304c5400701f91da01b1a643a207331de`
- [上游原文件 assets/whale/actions.png](https://github.com/YunYueSama/codex-deepseek-pet/blob/7661c8b304c5400701f91da01b1a643a207331de/assets/whale/actions.png)
- 尺寸：2048×2048，4×4 图集，每格 512×512。
- 大小：3,898,755 字节。
- SHA-256：`B3F5063653A5366F35F93E95A2717076571C67A390A99794C2B7FA35E155146B`

原图逐字节保留，没有重绘、补帧、镜像或修改图片。网页仅使用 CSS 选取单格、缩放与定位。仓库内自带图片，下载 ZIP 或克隆后不需要自行下载，也不依赖 GitHub、CDN 等图片外链。图片缺失时显示文字提示，查词与生词本仍可使用；应用不会自动联网找图。

## 独立美术许可，不属于源码 MIT

本项目源码采用 MIT；第三方角色图片及其许可存档不纳入本项目 MIT。图片依据上游「大肥鱼项目署名许可 1.0（自定义许可，非标准 MIT）」分发作者有权授权的贡献。

完整存档随图片一起分发：

- [YunYueSama-LICENSE.txt](src/local-assets/YunYueSama-LICENSE.txt)：上游完整许可与版权声明。
- [YunYueSama-ASSET_LICENSE.md](src/local-assets/YunYueSama-ASSET_LICENSE.md)：上游素材说明，仅将链接指向固定提交或本地许可文件，并注明该链接调整。

上游固定版本的 [LICENSE](https://github.com/YunYueSama/codex-deepseek-pet/blob/7661c8b304c5400701f91da01b1a643a207331de/LICENSE) 允许使用、修改、分享及商用其有权授权的贡献。分发时必须保留完整许可与版权声明，注明 `作者：YunYueSama` 和完整仓库地址；如有修改须说明，不得暗示作者或 DeepSeek 官方背书。本项目 README、此清单及页面页脚均保留署名和来源。

[上游素材声明](https://github.com/YunYueSama/codex-deepseek-pet/blob/7661c8b304c5400701f91da01b1a643a207331de/ASSET_LICENSE.md) 说明素材来自社区角色参考，经上游 AI 生成、透明化和编译。授权不额外授予底层角色、参考作品、标志等第三方权利；这些权利仍由各自权利人保留。不能将素材描述为本项目原创、纯手绘或已解决全部上游授权。公开可下载也不意味着任意其他图片都可重新分发。

## 当前显示方式

图集格号按行优先、从 0 开始。姿态与场景的对应由本项目定义，不是新的角色设定。

| 应用场景 | 零基格号 |
| --- | --- |
| 待机 / 取消 | 0 |
| 查词等待 / 本地词卡复习 | 2 |
| 查词结果 / 朗读状态 | 5 |
| 错误 / 未识别 | 9 |
| 戳一下，停留 1.5 秒后恢复 | 10 |
| 保存成功 | 15 |

默认静止，不循环播放、不跟随鼠标、不自动互动。只渲染一层、一个格，不叠加第二张立绘。动作不请求 LLM/TTS；朗读姿态不代表精准口型。

## 不随仓库分发的研究素材

早期研究过其他公开桌宠、立绘和 dense/story 图集，但当前应用不加载它们，也不作为回退。`.gitignore` 只允许上述图片和两份许可存档进入 `src/local-assets/` 的发布内容，其余本地研究文件、原始社区参考图及其他画风均不随仓库发布。

公开候选及各自许可边界见 [设计研究](docs/DESIGN_RESEARCH.md)。候选清单不是对其他素材的再分发许可。若将来更换或增加图片，应逐文件核对作者、来源、具体许可与署名要求。

## 完整性验证

`node --test test/release.test.js` 检查图片的固定哈希、PNG 实际尺寸、独立许可存档及 HTTP 原样提供，同时确认私有凭证路径不可作为静态资源访问。测试不调用模型或 TTS，不读取真实密钥；结构测试不代替视觉验收或版权链保证。
