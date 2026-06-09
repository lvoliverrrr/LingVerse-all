# 灵界挂机自动化研究记录

更新时间：2026-06-09

## 当前目标

先用外部脚本把挂机体验做成可测试原型。测试稳定后，再决定哪些能力合入游戏本体。

本轮已确认并实现的低风险闭环：

- 神识低于阈值时进入冥想。
- 冥想到自定义时长后收功。
- 神识可用时启动游戏原生自动探索。
- 自动探索遇到云游商人时沿用已有自动购买最高价商品逻辑。
- 遇到商人、遭遇、战斗时基础挂机循环先等待，避免并发点击。

本轮继续确认并实现的富裕模式基础：

- 遭遇妖兽后，只有开启“自动迎战”才会进入自动战斗 handler。
- 战斗符箓按 template family 去重，最多选择 5 种，默认每种 1 张。
- 涅槃重生丹只匹配五行通灵类 `bp_pill_rebirth_*`，不把回血用的 `pill_nirvana_*` 当作同一种丹。
- 已有五行通灵 buff 时默认不继续排队，除非开启“允许排队”。

## 真实浏览器证据

使用 Agent Browser CLI 接管用户 Edge 登录态，游戏标签：

- tab：`292345702`
- URL：`https://ling.muge.info/game.html`
- 标题：`灵界 LingVerse - 修仙世界`

只读探针确认页面能力：

- `api` 存在，但 `window.api` 不存在，脚本需要继续支持 `eval('typeof api...')` 兜底。
- `_lastPlayerData` 包含 `spirit`、`maxSpirit`、`spiritCost`、`canExplore`、`exploreDisabledReason`、`isMeditating`、`isDead`。
- 当前读到一次状态：神识 `3/2758`，未冥想，未死亡。
- v2.18.0 再次只读状态：`autoExploreRunning=false`、`autoResumeExplorePending=false`、神识 `3/2758`、单次探索消耗 `4`、`canExplore=true`。
- v2.20.0 只读遭遇状态：`_encounterActive=false` 且 `#encounterOverlay.hidden=true`，但页面仍保留旧 `_currentEncounterMonsterId=port_bandit` 和旧面板文本；因此 encounter key 必须只在 active 遭遇/战斗时生成。
- v2.22.0 只读护道状态：`getAutoHireConfig()` 返回当前账号已开启自动护道，模式 `alone`，最高雇佣费 `51`，优先级 `normal,incarnation,body`。
- v2.22.0 只读函数确认：`handleCombatChoice('fight')` 会直接调用 `/api/game/combat-choice` 迎战；`tryAutoHireProtectorForEncounter()` 会读取 `getAutoHireConfig()` 并调用 `/api/game/encounter-auto-hire`，遇 429 会等待 600ms 重试一次。
- v2.23.0 只读死亡状态：页面同时暴露 `playerDead` 和 `_lastPlayerData.isDead`；`handleRevive()` 会调用 `/api/game/revive`、隐藏死亡遮罩、刷新玩家信息和地图。
- v2.24.0 只读恢复挂起逻辑：`_tryResumeAutoExploreAfterMerchant()` 会在 `_autoResumeExplorePending` 时清标记并延迟 1500ms 调 `startAutoExplore()`；若 pending 残留，辅助脚本需要按卡住超时兜底。
- v2.42.0 只读状态：真实页仍显示“灵界已更新新版本，请点此刷新 获取最新内容”；helper 已注入（`window._autoMapInited=true`），但真实页需要刷新/重载扩展后才会加载本地最新版；页面神识 `3/2758`、位置沧澜港、可见“冥想修炼/探索(-4神识)/自动/万物图鉴”等入口。本次只读观察未点击探索、商人、战斗、护道、复活、用符或用丹。
- v2.43.0 只读库存：`/api/game/inventory` 读到 184 项；当前相关资源包含 5 类战斗符箓 `ancient/ghost/thunder/fire/shield`，以及 `pill_nirvana_*` 九转还魂丹；没有读到 `bp_pill_rebirth_*` 涅槃重生丹。因此富裕模式应报告“用符 5/5类，涅槃丹无史诗+”，并继续避免把回血丹误当作五行通灵丹。
- v2.44.0 只读护道配置：真实页仍显示更新提示，`window.LingVerseAutoMapVersion=null` 说明需要刷新/重载扩展；`getAutoHireConfig()` 返回游戏护道已开启，模式 `alone`，最高雇佣费 `51`，优先级 `normal,incarnation,body`。本次只读观察未点击探索、护道、战斗、复活、用符或用丹。
- v2.45.0 只读环境状态：真实页仍显示“灵界已更新新版本，请点此刷新 获取最新内容”，helper hook 存在但 `window.LingVerseAutoMapVersion=null`，说明测试前需要刷新页面或重载扩展，否则测试反馈会混入旧页面状态。
- v2.48.0 只读低神识状态：真实页仍显示游戏更新提示，`window.LingVerseAutoMapVersion=null`，`_lastPlayerData` 为神识 `3/2758`、单次探索消耗 `4`、`canExplore=true`、未冥想、未死亡，自动探索未运行且未挂起；本次只读观察未点击探索、冥想、护道、战斗、复活、用符或用丹。
- v2.49.0 只读护道配置复核：真实页仍显示游戏更新提示，`getAutoHireConfig()` 返回游戏护道已开启、模式 `alone`、最高雇佣费 `51`、优先级 `normal,incarnation,body`，当前无遭遇/战斗；本次只读观察未点击探索、冥想、护道、战斗、复活、用符或用丹。
- v2.50.0 只读迎战入口复核：真实页仍显示游戏更新提示，当前无遭遇/战斗；页面存在 `handleCombatChoice`、迎战/对战按钮和 `showEncounterTalismanDialog`，说明富裕模式迎战链路可继续按按钮、页面函数、API 三层来源报告；本次只读观察未点击探索、冥想、护道、战斗、复活、用符或用丹。
- v2.52.0 只读页面复核：Agent Browser CLI 读取真实 Edge 标签 `292345702`，页面仍为 `LingVerseAutoMapVersion=null`、`_autoMapInited=true`、存在游戏更新提示；页面神识 `3/2758`，未死亡、未冥想，存在 `handleCombatChoice` 和 `showEncounterTalismanDialog`。本次只读观察未点击探索、冥想、护道、战斗、复活、用符或用丹。
- v2.53.0 只读复活入口复核：真实 Edge 标签 `292345702` 仍为旧注入/游戏更新状态，当前未死亡、页面未显示复活按钮；页面存在 `handleRevive`/复活函数入口。本次只读观察未点击探索、冥想、护道、战斗、复活、用符或用丹。
- v2.57.0 只读页面复核：真实 Edge 标签 `292345702` 仍显示游戏更新提示，`window.LingVerseAutoMapVersion=null`、`_autoMapInited=true`；当前神识 `3/2758`、单次探索消耗 `4`、可探索、未冥想、未死亡。页面函数 `handleMeditate`、`handleStopMeditate`、`startAutoExplore`、`stopAutoExplore`、`handleCombatChoice`、`showEncounterTalismanDialog`、`handleRevive` 均存在。本次只读观察未点击探索、冥想、商人、护道、战斗、复活、用符或用丹。
- v2.64.0 只读页面复核：真实 Edge 标签 `292345702` 当前仍加载 helper `2.58.0`，`_autoMapInited=true`，神识 `472/2758`，未冥想、未死亡，无游戏更新提示；测试 `2.64.0` 前仍需重载本地扩展并刷新页面。本次只读观察未点击探索、冥想、商人、护道、战斗、复活、用符或用丹。
- v2.65.0 只读页面复核：真实 Edge 标签 `292345702` 仍加载 helper `2.58.0`，`_autoMapInited=true`，神识 `472/2758`，未冥想、未死亡，无游戏更新提示；测试 `2.65.0` 前仍需重载本地扩展并刷新页面。本次只读观察未点击探索、冥想、商人、护道、战斗、复活、用符或用丹。
- v2.66.0 只读页面复核：真实 Edge 标签 `292345702` 仍加载 helper `2.58.0`，`_autoMapInited=true`，神识 `472/2758`，未冥想、未死亡，无游戏更新提示；测试 `2.66.0` 前仍需重载本地扩展并刷新页面。本次只读观察未点击探索、冥想、商人、护道、战斗、复活、用符或用丹。
- v2.67.0 只读页面复核：真实 Edge 标签 `292345702` 仍加载 helper `2.58.0`，`_autoMapInited=true`，神识 `472/2758`，未冥想、未死亡，无游戏更新提示；测试 `2.67.0` 前仍需重载本地扩展并刷新页面。本次只读观察未点击探索、冥想、商人、护道、战斗、复活、用符或用丹。
- v2.68.0 只读页面复核：真实 Edge 标签 `292345702` 仍加载 helper `2.58.0`，`_autoMapInited=true`，神识 `3/2756`，未冥想、未死亡，无游戏更新提示、无陌生道友弹窗；测试 `2.68.0` 前仍需重载本地扩展并刷新页面。本次只读观察未点击探索、冥想、商人、护道、战斗、复活、用符、用丹或陌生道友按钮。
- v2.69.0 只读页面复核：真实 Edge 标签 `292345702` 仍加载 helper `2.58.0`，`_autoMapInited=true`，神识 `3/2756`，未冥想、未死亡，无游戏更新提示、无奇遇/陌生道友弹窗；测试 `2.69.0` 前仍需重载本地扩展并刷新页面。本次只读观察未点击探索、冥想、商人、护道、战斗、复活、用符、用丹、奇遇选项或陌生道友按钮。
- v2.70.0 只读页面复核：真实 Edge 标签 `292345702` 仍加载 helper `2.58.0`，`_autoMapInited=true`，神识 `3/2756`，未冥想、未死亡，无游戏更新提示、无商人/遭遇/战斗/奇遇/陌生道友/混天典狱；测试 `2.70.0` 前仍需重载本地扩展并刷新页面。本次只读观察未点击探索、冥想、商人、护道、战斗、复活、用符、用丹、奇遇选项或陌生道友按钮，也未尝试跳过混天典狱。
- v2.71.0 只读页面复核：真实 Edge 标签 `292345702` 仍加载 helper `2.58.0`，`_autoMapInited=true`，页面尚无 `lingverseAutoMapExtensionVersion` / `lingverseAutoMapInjectedVersion` dataset，神识 `3/2756`，未冥想、未死亡，无游戏更新提示、无商人/遭遇/战斗/奇遇/陌生道友/混天典狱；测试 `2.71.0` 前仍需重载本地扩展并刷新页面。本次只读观察未点击探索、冥想、商人、护道、战斗、复活、用符、用丹、奇遇选项或陌生道友按钮，也未尝试注入新版脚本。
- v2.72.0 只读页面复核：真实 Edge 标签 `292345702` 仍加载 helper `2.58.0`，`_autoMapInited=true`，无 `LingVerseAutoMapInitializedVersion`，页面尚无扩展/注入版本 dataset，神识 `3/2756`，未冥想、未死亡，无游戏更新提示、无商人/遭遇/战斗/奇遇/陌生道友/混天典狱；测试 `2.72.0` 前仍需重载本地扩展并刷新页面。本次只读观察未点击探索、冥想、商人、护道、战斗、复活、用符、用丹、奇遇选项或陌生道友按钮，也未尝试注入新版脚本。
- v2.73.0 只读页面复核：真实 Edge 标签 `292345702` 仍加载旧 helper `2.58.0`，`_autoMapInited=true`，页面尚无扩展/注入版本 dataset，神识 `3/2756`、单次消耗 `4`、倍率按钮 `×5`；页面可见 `#meditationBar` “冥想修炼中 (最长12小时) / 1时30分 / 收功”，但 `_lastPlayerData.isMeditating=false`。本次只读观察未点击收功、探索、商人、护道、战斗、复活、用符、用丹、奇遇选项或陌生道友按钮，也未尝试注入新版脚本。
- v2.74.0 只读页面复核：真实 Edge 标签 `292345702` 仍加载旧 helper `2.58.0`，页面可见 `#meditationBar` “冥想修炼中 (最长12小时) / 1时48分 / 收功”，但 `_lastPlayerData.isMeditating=false`；当前神识 `3/2756`、单次消耗 `4`、`canExplore=true`、倍率按钮 `×5`，无商人/遭遇/战斗/奇遇 blocker。本次只读观察未点击收功、探索、商人、护道、战斗、复活、用符、用丹、奇遇选项或陌生道友按钮，也未尝试注入新版脚本。
- v2.75.0 只读页面复核：真实 Edge 标签 `292345702` 仍加载旧 helper `2.58.0`，页面可见 `#meditationBar` “冥想修炼中 (最长12小时) / 2时2分 / 恢复: 7826血 / 4054灵 / 1234识 / 收功”，但 `_lastPlayerData.isMeditating=false` 且缓存神识仍为 `3/2756`。本次只读观察未点击收功、探索、商人、护道、战斗、复活、用符、用丹、奇遇选项或陌生道友按钮，也未尝试注入新版脚本。
- v2.76.0 只读页面复核：真实 Edge 标签 `292345702` 仍加载旧 helper `2.58.0`，无扩展/注入/面板初始化版本 dataset；页面可见 `#meditationBar` “冥想修炼中 (最长12小时) / 2时29分 / 恢复: 9545血 / 4945灵 / 1505识 / 收功”，但 `_lastPlayerData.isMeditating=false` 且缓存神识仍为 `3/2756`。后续测试需重载本地扩展并刷新页面，v2.76.0 应在复制状态里显示 `冥想兜底:` 解释该兜底依据。本次只读观察未点击收功、探索、商人、护道、战斗、复活、用符、用丹、奇遇选项或陌生道友按钮，也未尝试注入新版脚本。
- v2.77.0 只读页面复核：真实 Edge 标签 `292345702` 仍加载旧 helper `2.58.0`，无扩展/注入/面板初始化版本 dataset；页面可见 `#meditationBar` “冥想修炼中 (最长12小时) / 2时47分 / 恢复: 10724血 / 5556灵 / 1691识 / 收功”，但 `_lastPlayerData.isMeditating=false` 且缓存神识仍为 `3/2756`，无商人/遭遇/战斗/奇遇/陌生道友 blocker。后续测试需重载本地扩展并刷新页面，v2.77.0 成功收功后应进入 `收功恢复窗口`，优先接上自动探索。本次只读观察未点击收功、探索、商人、护道、战斗、复活、用符、用丹、奇遇选项或陌生道友按钮，也未尝试注入新版脚本。
- v2.78.0 只读页面复核：真实 Edge 标签 `292345702` 仍加载旧 helper `2.58.0`，无扩展/注入/面板初始化版本 dataset；页面可见 `#meditationBar` “冥想修炼中 (最长12小时) / 3时2分 / 恢复: 11684血 / 6053灵 / 1843识 / 收功”，但 `_lastPlayerData.isMeditating=false` 且缓存神识仍为 `3/2756`，无商人/遭遇/战斗/奇遇/陌生道友 blocker。后续测试需重载本地扩展并刷新页面，若收功恢复窗口未能接上探索，v2.78.0 状态应显示 `收功后未能重启探索` 诊断归因。本次只读观察未点击收功、探索、商人、护道、战斗、复活、用符、用丹、奇遇选项或陌生道友按钮，也未尝试注入新版脚本。
- v2.79.0 只读页面复核：真实 Edge 标签 `292345702` 仍加载旧 helper `2.58.0`，无扩展/注入/面板初始化版本 dataset；页面可见 `#meditationBar` “冥想修炼中 (最长12小时) / 3时15分 / 恢复: 11936血 / 6184灵 / 1882识 / 收功”，但 `_lastPlayerData.isMeditating=false`；缓存神识 `1896/2756`、`canExplore=true`，无商人/遭遇/战斗/奇遇 blocker。后续测试需重载本地扩展并刷新页面，v2.79.0 应在收功恢复窗口内允许空原因的 `canExplore=false` 继续尝试 `post-meditation-ready`。本次只读观察未点击收功、探索、商人、护道、战斗、复活、用符、用丹、奇遇选项或道友按钮，也未尝试注入新版脚本。
- v2.80.0 只读页面复核：真实 Edge 标签 `292345702` 仍加载旧 helper `2.58.0`；页面可见 `#meditationBar` “冥想修炼中 (最长12小时) / 3时23分 / 恢复: 11936血 / 6184灵 / 1882识 / 收功”，但 `_lastPlayerData.isMeditating=false`；缓存神识 `1696/2756`、`canExplore=true`，玩家邂逅相关 modal selector 均不存在，无商人/遭遇/战斗/奇遇 blocker。后续测试需重载本地扩展并刷新页面，v2.80.0 应减少隐藏 DOM 残留误报商人/遭遇/奇遇/陌生道友/冥想条 blocker。本次只读观察未点击收功、探索、商人、护道、战斗、复活、用符、用丹、奇遇选项或道友按钮，也未尝试注入新版脚本。
- v2.81.0 只读页面复核：真实 Edge 标签 `292345702` 仍加载旧 helper `2.58.0`；当前在北荒前哨遭遇 `北荒火鹰`，`#encounterOverlay` 可见，文本含 `自动雇护道第 1 次重试中，可手动接管`，`_encounterActive=true`、`_autoResumeExplorePending=true`，缓存神识 `1246/2756`、单次消耗 `10`、未死亡；商人/奇遇/符箓弹窗为隐藏 DOM。后续测试需重载本地扩展并刷新页面，v2.81.0 应把该状态归类为 `guardian-in-progress` 并等待游戏护道结算，不重复触发护道入口。本次只读观察未点击收功、探索、商人、护道、战斗、复活、用符、用丹、奇遇选项或道友按钮，也未尝试注入新版脚本。
- v2.82.0 研究结论：富裕 50 倍探索的启动门槛不能只看 `minSpirit` 或单次 `spiritCost`。真实页单次消耗可为 `10`，50 倍批次实际至少需要 `500` 神识；当缓存神识例如 `120` 时，应回冥想并报告 `神识不足当前倍率` / `50倍需500`。该规则只影响决策路由和报告，不新增探索、商人、护道、战斗、复活、用符或用丹调用。
- v2.83.0 研究结论：真实页旧 helper 日志反复出现云游商人自动购买，说明商人仍是长跑高频中断点。商人配置里的“只在自动探索时处理”应保护手动购物，但 AFK 循环本身也是自动化上下文；因此 `CONFIG.afkLoop.enabled=true` 时允许 MerchantAutoBuyer 处理商人，避免原生 `_autoResumeExplorePending` 缺失导致挂机停在商人。该规则只扩大已启动挂机时的商人入口，不改变未挂机手动购物保护。
- v2.84.0 研究结论：v2.83.0 已把 AFK 循环纳入自动商人上下文，但面板文案仍写“仅自动探索挂起时处理”，容易让测试者误以为挂机循环不会触发商人处理。本版只把面板和 README 文案收敛为“仅自动探索/挂机循环时处理”，不改变商人购买、探索、护道、战斗、复活、用符或用丹调用。
- v2.85.0 研究结论：真实页再次出现可见 `#meditationBar` 与 `_lastPlayerData.isMeditating=false` 不同步，且缓存神识很低但冥想条已经显示恢复神识。本版在复制状态中新增 `冥想同步:` 行，明确说明玩家缓存未标记冥想、脚本已按可见冥想条估算；该变更只增强诊断，不新增收功、探索、商人、护道、战斗、复活、用符或用丹调用。
- v2.86.0 研究结论：真实页冥想条在只读观察中可表现为一整行文本，例如 `冥想修炼中 (最长12小时) 25分50秒 ... 收功`。旧解析会因同一行包含“最长/预计/恢复”而丢失已冥想时长，影响 140 分钟到点收功。本版在多行解析失败时，从“冥想修炼中 (最长12小时)”后提取真实已冥想时长，避开最长 12 小时上限；该变更只读解析冥想条，不新增收功、探索、商人、护道、战斗、复活、用符或用丹调用。
- v2.89.0 本地候选研究结论：富裕模式必须确认页面实际倍率已经切到目标倍率后才启动自动探索。真实页 `getExploreMultiplier()` / `setExploreMultiplierValue()` 可读写当前倍率，`_autoExploreRunning` / `_autoResumeExplorePending` 可确认自动探索入口调用后是否真的进入运行或恢复挂起；本版在 `startAutoExplore` 设置倍率后读回实际值，目标 50 倍但实际仍 1 倍时记录 `start-failed`，状态显示目标/实际倍率，并阻止启动自动探索。涅槃重生丹使用顺序也调整为“倍率确认后再用丹”，避免倍率未切成功时先消耗丹药；入口调用后若页面运行标志仍未开启，也记录 `start-failed`，避免打坐、事件、商人或低神识阻塞时误报已启动。富裕遭遇链也补强同一轮安全等待：用符后如果 `dialogClosed=false`，`handleEncounter` 不会继续调用迎战，而是等下一轮读取真实符箓面板状态，避免用符界面遮挡时误点对战；如果本次已选符箓全部使用失败，`resolveEncounterFightAttempt` 会返回 `talisman-use-failed` 并把脱敏失败消息显示在迎战建议里，避免在“本来打算用符但全失败”的危险状态下继续自动对战。没有可用符箓仍保持原逻辑：跳过用符，允许后续迎战/护道策略继续。自动复活入口返回后会再读页面死亡状态；若仍死亡则记录 `revive-not-confirmed`、不打开复活恢复窗口，并把入口调用计入本轮复活尝试，避免富裕模式在复活未确认时误接 50 倍探索或默认上限下重复扣资源。本版还新增最近奇遇样本历史：`buildSnapshot` 只在奇遇可见且有选项时记录最近 5 个 ID/步骤/选项样本，状态报告和摘要回放可在奇遇弹窗关闭后继续输出 `奇遇样本:` 与可导入 `adventureId=choiceIndex` 策略候选。该变更只影响探索启动前后校验、资源保护、迎战阻断、复活结果确认和只读诊断样本，不新增商人、护道、战斗、复活、用符、用丹或奇遇点击入口调用；按用户要求暂不推送，等待关键功能里程碑一起发布。
- v2.89.0 只读 Edge 证据：真实 Edge 的 LingVerse unpacked 扩展 ID 为 `pnighlpbfnpjofjglooiallkccdhahec`，路径指向 `\\wsl.localhost\\Ubuntu-22.04\\home\\lxh\\LingVerse-all`；通过 Edge 扩展页 UIA 精准执行该扩展的“重新加载”后，扩展页显示版本 `2.89.0`。刷新游戏标签 `292345702` 后，helper/扩展/注入/面板初始化版本均为 `2.89.0`；页面更新提示消失，实际倍率 `1`，缓存神识 `840/2756`，当前未死亡、AFK 关闭、自动探索未运行、无商人/遭遇/奇遇/符箓弹窗。该观察只重载扩展并刷新页面以加载脚本，未点击收功、探索、商人、护道、战斗、复活、用符、用丹、奇遇或陌生道友按钮。
- v2.90.0 本地候选研究结论：未知等待和自动动作反复未推进时，只有 `诊断:` / `诊断归因:` 还不够复盘页面最后发生了什么。本版在等待诊断 active 且 category 为 `unknown` 或 `auto-action` 时，从 `history.logTail` 取最近一条非空脚本日志，追加到可读状态报告的 `现场日志:` 行，并沿用现有 URL query/hash 与 token/session 脱敏规则。该变更只读已有日志摘要，不新增商人、护道、战斗、复活、用符、用丹、奇遇、探索或冥想入口调用；按用户要求暂不推送，等待关键功能里程碑一起发布。
- v2.90.0 只读 Edge 证据：Agent Browser Bridge profile 已标记为 `edge-personal-lingverse`，游戏标签仍为 `292345702`。重载前页面主体 helper/初始化版本已是 `2.90.0`，但 DOM dataset 的扩展/注入版本仍停在 `2.89.0`；UIA 确认个人 Edge profile 的 unpacked 扩展卡片显示 `灵界 LingVerse 助手 2.90.0`，路径仍指向 `\\wsl.localhost\\Ubuntu-22.04\\home\\lxh\\LingVerse-all`。在个人 profile 的扩展页精准调用该卡片“重新加载”并刷新游戏标签后，helper/扩展/注入/面板初始化版本均为 `2.90.0`；AFK 关闭、自动探索未运行，页面当前无云游商人、遭遇妖兽、奇遇或符箓文本。该观察只重载扩展并刷新页面以加载脚本，未点击收功、探索、商人、护道、战斗、复活、用符、用丹、奇遇或陌生道友按钮。
- v2.91.0 本地候选研究结论：挂机循环已有 `explore-stalled -> startMeditation` 决策，但复制状态只写“自动探索疑似卡住”，测试者不容易确认触发阈值。本版在 `回冥想:` 行对 `explore-stalled` 追加 `卡住判定...秒`，让“探索不动所以回冥想”的原因和配置阈值同屏出现。该变更只增强报告文本，不新增商人、护道、战斗、复活、用符、用丹、奇遇、探索或冥想入口调用；按用户要求暂不推送，等待关键功能里程碑一起发布。
- v2.91.0 只读 Edge 证据：Agent Browser Bridge profile 继续使用 `edge-personal-lingverse`，扩展重载后当前有效游戏标签为 `292345957`（旧 `292345702` 已断开）。真实页读取到 helper/扩展/注入/面板初始化版本均为 `2.91.0`，AFK 关闭、自动探索未运行，页面可见“启动挂机/停止挂机”和云游商人自动购买配置，控制台 error 列表为空。该观察只读取页面状态、快照和控制台错误，未点击收功、探索、商人、护道、战斗、复活、用符、用丹、奇遇或陌生道友按钮。
- v2.92.0 本地候选研究结论：真实 Edge 页面日志尾部会持续出现 `[收入] 探索宝地`、`探索双收获事件`、`击败北荒火鹰`、`保底获得` 等结算文本；这些文本比 `_autoExploreCount` 更能反映“自动探索仍在推进”。本版新增只读探索日志签名，自动探索运行/恢复挂起时如果最近探索、击败或收入日志变化，就刷新 `lastExploreProgressAt`，避免页面计数未刷新但实际仍在获得收益时被 `explore-stalled` 误判回冥想。该变更只读取页面文本，不新增收功、探索、商人、护道、战斗、复活、用符、用丹、奇遇或陌生道友按钮动作；按用户要求暂不推送，等待关键功能里程碑一起发布。
- v2.92.0 只读 Edge 游戏页证据：按用户指示只接管 `https://ling.muge.info/game.html`，真实 Edge 标签仍为 `292345957`。游戏页实际 helper/面板初始化版本均为 `2.92.0`，`getExploreProgressLogSignature` 测试钩子存在，并能从页面文本提取 `击败北荒火鹰 / 保底获得 / 探索(-10神识)` 进展签名；AFK 关闭、自动探索未运行、自动恢复挂起为 false。扩展/注入 dataset 仍显示 `2.91.0`，说明扩展 loader 版本提示待下次重载统一，但当前游戏页核心 helper 代码已是 `2.92.0`。该观察只读取游戏页状态和快照，未点击收功、探索、商人、护道、战斗、复活、用符、用丹、奇遇或陌生道友按钮。
- v2.93.0 本地候选研究结论：真实 Edge 游戏页已经证明 helper 顶层版本与面板初始化版本可以加载到新版，而扩展/注入 dataset 仍滞后一版。旧报告会把这种状态归类为“版本不一致，重载扩展并刷新页面”，容易让测试者继续折腾扩展页；本版新增 `extensionVersionStale` 诊断，只有在 helper/面板初始化均等于当前脚本版本、且扩展版本低于当前脚本版本时，状态报告改写为“页面已加载新版，扩展提示待下次重载统一”。该变更只影响可读状态环境行，不新增收功、探索、商人、护道、战斗、复活、用符、用丹、奇遇或陌生道友按钮动作；按用户要求暂不推送，等待关键功能里程碑一起发布。
- v2.93.0 只读 Edge 游戏页证据：按用户要求不再进入扩展管理页，只刷新标签 `292345957` 的 `https://ling.muge.info/game.html`。刷新后 helper/面板初始化版本均为 `2.93.0`，扩展/注入 dataset 仍显示 `2.91.0`；`buildAfkStatusReport` 输出 `环境: helper 2.93.0 · 扩展提示 2.91.0 · 页面已加载新版，扩展提示待下次重载统一`。AFK 关闭、自动探索未运行、自动恢复挂起 false，缓存神识 `627/2756`、单次消耗 `10`、可探索、未死亡、未冥想。该观察只刷新游戏页和读取状态，未点击收功、探索、商人、护道、战斗、复活、用符、用丹、奇遇或陌生道友按钮。
- v2.94.0 本地候选研究结论：真实玩法里奇遇链默认需要谨慎，不能在未知分支上替玩家选择；但 `showAdventureStep(step)` 里已有 `isComplete` 字段，完成奇遇且界面只剩结束/关闭按钮时继续等待会让挂机无意义卡住。本版新增 `autoCloseCompletedAdventure`，默认开启，可在面板关闭；`decideAfkNextAction` 仅在 `adventureActive && adventureComplete` 时返回 `handleAdventure/adventure-close-completed`，`handleAdventure` 在 pause 模式仍拒绝点击任何选项按钮，只允许 `adventureStep.isComplete` 且存在关闭按钮时收尾，并进入现有事件恢复窗口。状态报告会明确“不自动选择新剧情”。该变更只影响已完成奇遇关闭动作，不新增收功、探索、商人、护道、战斗、复活、用符、用丹或未完成奇遇选项动作；按用户要求暂不推送，等待关键功能里程碑一起发布。
- v2.94.0 只读 Edge 游戏页证据：仍只接管标签 `292345957` 的 `https://ling.muge.info/game.html`。刷新后 helper/面板初始化版本均为 `2.94.0`，扩展/注入 dataset 仍显示 `2.91.0`；通过测试钩子确认 `autoCloseCompletedAdventure` 默认 true，已完成奇遇决策为 `handleAdventure/adventure-close-completed`，未完成奇遇仍为 `wait/adventure-active`，状态报告输出 `奇遇动作: 准备关闭奇遇 · #456` 与“不自动选择新剧情”。AFK 关闭、自动探索未运行、自动恢复挂起 false，缓存神识 `627/2756`、单次消耗 `10`、可探索、未死亡、未冥想。该观察只刷新游戏页和读取测试钩子，未点击收功、探索、商人、护道、战斗、复活、用符、用丹、奇遇或陌生道友按钮。
- v2.95.0 本地候选研究结论：策略模式下自动选择奇遇分支是测试者显式 opt-in，但真实页面可能停在同一个奇遇步骤没有推进；如果循环继续点同一个选项，既可能造成重复提交，也会让状态报告很难判断是页面慢还是策略不匹配。本版新增同一步选择去重键 `adventureId + step + totalSteps + choiceIndex`，首次触发后记录，下一轮仍是同一步同一项时改为 `choice-already-triggered` 等待并提示“本步已触发自动选择”；当奇遇消失、关闭完成奇遇或步骤变化后再允许下一次策略触发。该变更只减少重复奇遇选项点击并增强报告，不新增收功、探索、商人、护道、战斗、复活、用符、用丹、完成奇遇关闭或陌生道友动作；按用户要求暂不推送，等待关键功能里程碑一起发布。
- v2.95.0 只读 Edge 游戏页证据：仍只接管标签 `292345957` 的 `https://ling.muge.info/game.html`，不进入扩展管理页。刷新前确认 AFK 关闭、自动探索未运行、自动恢复挂起 false；刷新后 helper/面板初始化/测试钩子版本均为 `2.95.0`，扩展/注入 dataset 仍显示 `2.91.0`。通过真实页测试钩子构造 `choice-already-triggered` 摘要，状态报告输出 `奇遇动作: 本步已触发自动选择 · #456 · 第2项「绕路离开」 · 选项按钮` 与 `奇遇建议: 本奇遇步骤已触发过自动选择 · 暂停重复点击，等待页面推进或手动处理后复制摘要`。AFK 关闭、自动探索未运行、自动恢复挂起 false，缓存神识 `467/2756`、单次消耗 `10`、可探索、未死亡、未冥想、无遭遇和当前奇遇 step、无游戏更新提示。该观察只刷新游戏页和读取/模拟测试钩子，未点击收功、探索、商人、护道、战斗、复活、用符、用丹、奇遇或陌生道友按钮。
- v2.96.0 本地候选研究结论：AFK 长跑的下一步决策高度依赖神识数值；真实 Edge 当前已读到 `7/2756` 的低神识临界状态，若 `_lastPlayerData` 短暂滞后，脚本可能错过“神识<20/不足单次探索/不足当前倍率整组消耗”并继续等待或尝试探索。本版让 `AfkLoopManager.buildSnapshot()` 每轮先尝试只读 `/api/player/info`，成功后使用返回值并同步 `_lastPlayerData`，失败时仍回退缓存。该变更只增加玩家信息 GET 和决策输入新鲜度，不新增收功、探索、商人、护道、战斗、复活、用符、用丹、奇遇或陌生道友动作；按用户要求暂不推送，等待关键功能里程碑一起发布。
- v2.96.0 开发前只读 Edge 证据：仍只接管标签 `292345957` 的 `https://ling.muge.info/game.html`。真实页 helper `2.95.0`，AFK 关闭、自动探索未运行、自动恢复挂起 false；`_lastPlayerData` 和可见状态栏 `#statSpirit` 均显示神识 `7/2756`，单次消耗 `10`，可探索、未死亡、未冥想。该观察只读 DOM/测试钩子/玩家缓存，未点击收功、探索、商人、护道、战斗、复活、用符、用丹、奇遇或陌生道友按钮。
- v2.96.0 只读 Edge 游戏页证据：仍只接管标签 `292345957` 的 `https://ling.muge.info/game.html`，不进入扩展管理页。确认 AFK 关闭、自动探索未运行、自动恢复挂起 false 后刷新游戏页，helper/面板初始化/测试钩子均为 `2.96.0`。用独立临时 manager 把 `_lastPlayerData.spirit` 模拟成 `467` 后调用 `buildSnapshot`，快照仍读回接口神识 `7`、单次消耗 `10`，`decideAfkNextAction` 返回 `startMeditation/spirit-below-threshold`，缓存恢复到 `7`。该观察只刷新页面、读取玩家信息和临时模拟测试钩子，未点击收功、探索、商人、护道、战斗、复活、用符、用丹、奇遇或陌生道友按钮。
- v2.97.0 本地候选研究结论：游戏说明写明“批量探索触发遭遇时不能雇护道/请护道者”，所以护道 1 倍和富裕 50 倍不能混成一个模式。若测试者手动开启 `autoHireGuardian` 并设置 5/10/20/50 倍探索，`resolveEncounterGuardianAttempt` 返回 `guardian-batch-explore-unavailable`，AFK 不会触发护道入口；风险预检会提示“批量探索遭遇不能雇护道，自动护道仅建议用于1倍探索”。这只是避免无效/误扣费的护道入口保护，不新增探索、迎战、复活、用符、用丹、商人、奇遇或陌生道友动作。
- v2.97.0 只读 Edge 游戏页证据：使用真实 Edge profile `edge-personal-lingverse`，通过 UIA 精准调用 LingVerse unpacked 扩展卡片 `pnighlpbfnpjofjglooiallkccdhahec` 的“重新加载”，扩展页显示版本 `2.97.0`。刷新 `https://ling.muge.info/game.html` 标签 `292345957` 后，helper/initialized/extension/injected 均为 `2.97.0`，AFK 关闭、自动探索未运行。测试钩子模拟 `autoHireGuardian=true` + `exploreMultiplier=50` 返回 `guardian-batch-explore-unavailable`，风险预检输出“批量探索遭遇不能雇护道，自动护道仅建议用于1倍探索”。本次只刷新页面、重载扩展和读测试钩子，未点击收功、探索、商人、护道、战斗、复活、用符、用丹、奇遇或陌生道友按钮。
- v2.98.0 本地候选研究结论：真实 Edge 刚加载游戏页时出现 `_lastPlayerData=null`、`#statSpirit=--`，但探索按钮已显示 `探索(-1神识)`；AFK 快照若只依赖接口/缓存，会短暂缺少单次消耗和神识字段。本版新增只读 DOM 兜底：解析 `#statSpirit` 的 `当前/上限` 和 `#exploreBtn` 的 `探索(-N神识)`，仅在玩家接口和缓存字段缺失时补齐 `spirit/maxSpirit/spiritCost`，不会覆盖新鲜接口数据，也不新增收功、探索、商人、护道、战斗、复活、用符、用丹、奇遇或陌生道友动作。
- v2.98.0 只读 Edge 游戏页证据：同步 main repo、standalone helper 和 Windows 扩展目录后，通过真实 Edge 扩展页 UIA 调用 LingVerse unpacked 扩展卡片的“重新加载”，刷新游戏标签 `292345957`。读回 helper/initialized/extension/injected 均为 `2.98.0`；`readAfkResourceDomFallback()` 从页面得到神识 `144/2756`、单次消耗 `10`，`buildSnapshot()` 同步得到 `spirit=144`、`maxSpirit=2756`、`spiritCost=10`，AFK 关闭、自动探索未运行、无商人/遭遇/奇遇 blocker。该验证只读取 DOM、接口和测试钩子，未点击收功、探索、商人、护道、战斗、复活、用符、用丹、奇遇或陌生道友按钮。
- v2.99.0 本地候选研究结论：真实 Edge 当前处于冥想中，页面冥想条给出 `已冥想1时17分` 和 `恢复710识`，但复制状态只显示计划剩余，没有告诉测试者按当前恢复速度到 140 分钟大约能回多少神识。本版新增报告-only 的 `冥想预计:` 行，用冥想条恢复量、已冥想时长和计划分钟估算当前有效神识与计划收功神识，帮助众测调整 140 分钟或自定义时长；同时修正云游商人商品缺少 `index` 字段时的最高价购买参数，用数组位置兜底，避免识别最高价后传空 index。该变更不改变收功、探索、商人安全上下文、护道、战斗、复活、用符、用丹、奇遇或陌生道友动作。
- v2.99.0 只读 Edge 游戏页证据：真实 Edge 用户配置 3 的 LingVerse unpacked 扩展 `pnighlpbfnpjofjglooiallkccdhahec` 已通过 UIAutomation 重新加载到 `2.99.0`；刷新 `https://ling.muge.info/game.html` 标签 `292345957` 后 helper/initialized/extension/injected/test hook 均为 `2.99.0`。状态报告输出 `冥想预计: 已恢复954识 · 当前估算1235/2756 · 计划收功约1563/2756`；`selectMerchantItem([{price:120},{price:"9,999"},{price:300}])` 返回最高价商品并补 `index:1`。AFK 关闭、自动探索未运行、商人未激活；本次未点击收功、探索、商人购买、护道、战斗、复活、用符、用丹、奇遇或陌生道友按钮。
- v2.100.0 本地候选研究结论：测试者经常需要判断当前神识能不能跑配置倍率，尤其是富裕 50 倍时“还差一点点”和“只能跑十几次 1 倍”很难从原状态报告看出来。本版新增报告-only 的 `探索续航:` 行，按当前神识、单次探索消耗和配置倍率计算每组消耗、可跑组数，并在倍率大于 1 时显示折算 1 倍探索次数；冥想中会使用已恢复神识计算当前估算，并在能推算计划时长时显示计划收功后约可跑几组；不足当前倍率时明确提示 `不足当前倍率`。真实 Edge 当前页面同时存在游戏日志、聊天和说明隐藏面板，因此自动探索进度签名来源也收窄为优先读取 `#logContent` / `.log-content` / `#logPanel` / `.log-area`，避免非日志区域的“探索/收入/击败”文字误刷新进度。该变更增强报告和卡住判定可靠性，不改变收功、探索启动、商人购买、护道、战斗、复活、用符、用丹、奇遇或陌生道友动作。
- v2.100.0 只读 Edge 游戏页证据：同步 main repo、standalone helper 和 Windows 扩展目录后，真实 Edge 用户配置 3 的扩展卡片仍显示 `2.99.0`，但 `\\wsl.localhost\\Ubuntu-22.04\\home\\lxh\\LingVerse-all\\manifest.json` 和 helper 文件均已由 Windows 侧读到 `2.100.0`；刷新 `https://ling.muge.info/game.html` 标签 `292345957` 后，页面 helper/面板初始化/测试钩子为 `2.100.0`，extension/injected dataset 仍为 `2.99.0`，状态报告环境行显示 `页面已加载新版，扩展提示待下次重载统一`。测试钩子确认 `selectMerchantItem([{price:120},{price:"9,999"},{price:300}])` 返回最高价商品并补 `index:1`；`readAfkExploreProgressLogText()` 从游戏日志容器读到探索/收入日志；当前 DOM 兜底神识 `281/2756`、单次消耗 `10`，`buildAfkExploreCapacityStatusLine` 输出 `探索续航: 当前281识 · 50倍需500识/组 · 可跑0组 · 约28次1倍探索 · 不足当前倍率`，冥想模拟输出当前估算和计划收功组数。本次只刷新页面、重载/读取扩展页、读取 DOM/接口/测试钩子和纯函数模拟，未点击收功、探索、商人购买、护道、战斗、复活、用符、用丹、奇遇或陌生道友按钮。
- v2.101.0 本地候选研究结论：游戏源码 `handleExplore()` 在探索响应 `res.code === 430` 时把“天道禁闭”作为停止自动探索的原因。该状态不适合外部脚本自动解除或点击，所以本版把 `天道禁闭` / `code=430` 归类为 manual hard-stop：快照/摘要记录 `heavenlyBanActive`，决策等待 `heavenly-ban`，状态报告显示 `硬停: 天道禁闭` 和不会自动跳过/点击/消耗资源的建议。该变更只增强停住原因解释，不新增收功、探索启动、商人购买、护道、战斗、复活、用符、用丹、奇遇、陌生道友或解除禁闭动作。
- v2.102.0 本地候选研究结论：云游商人最高价购买虽然已有页面函数/API 两条触发路径，但页面函数路径此前没有统一进入购买后的清理和恢复兜底，真实挂机中可能表现为“已买/已触发购买，但窗口仍在、自动探索没接上”。本版让页面函数购买后也调用 `clearMerchantState({ clearItems: true, resume: true })`、刷新日志/玩家信息并尝试 `_tryResumeAutoExploreAfterMerchant()`；如果连续等待商人且最近尝试为 `purchase-triggered`，状态报告会写明“云游商人购买已触发但窗口仍未关闭”。该变更只补商人购买后的收尾和诊断，不增加额外购买次数，不新增收功、探索启动、护道、战斗、复活、用符、用丹、奇遇或陌生道友动作。
- v2.103.0 本地候选研究结论：商人购买成功后，单靠游戏原生 `_tryResumeAutoExploreAfterMerchant()` 仍可能因为原生恢复标记丢失或玩家信息刷新滞后而没有立刻接回 AFK 探索。战斗、护道、奇遇、陌生道友已有 `postInteractionResume` 恢复窗口，本版把商人购买成功也接入同一个窗口：`MerchantAutoBuyer.refreshAfterBuy()` 会调用 `AfkLoopManager.openPostInteractionResumeWindow()`，清空上次决策并在 AFK 开启时触发下一轮检查。该变更只打开恢复窗口和复用现有下一轮决策，不增加额外商人购买，不直接新增探索启动、收功、护道、战斗、复活、用符、用丹、奇遇或陌生道友动作。
- v2.104.0 本地候选研究结论：事件恢复窗口现在有两类入口，商人购买走 `openPostInteractionResumeWindow()`，战斗迎战、护道、奇遇和陌生道友走 `schedulePostInteractionResume()`；此前后者只要恢复窗口大于 0 就会安排下一轮 tick，纯测试/手动调试时容易表现得比商人路径更主动。本版把两类入口都改为基于归一化 AFK 配置判断：恢复窗口照常记录、清空上次决策并刷新数据，但只有 `enabled=true` 时才安排 `tick(true)`。这统一了事件恢复调度，不新增任何游戏资源动作。
- v2.104.0 只读 Edge 游戏页证据：Agent Browser CLI 接管真实 Edge profile `edge-personal-lingverse` 的 `https://ling.muge.info/game.html` 标签 `292345957`。刷新前页面仍是 helper/initialized `2.102.0`，且 AFK 关闭、自动探索未运行、自动恢复挂起 false、商人未激活；刷新该游戏页后读回 helper/initialized `2.104.0`，extension/injected dataset 仍为 `2.99.0`，AFK 关闭、自动探索未运行、自动恢复挂起 false、商人未激活；控制台 error 列表为空。本次只刷新游戏页和读取页面变量/控制台，未点击收功、探索、商人购买、护道、战斗、复活、用符、用丹、奇遇或陌生道友按钮。
- v2.105.0 本地候选研究结论：众测反馈常常不是完整 JSON，而是可读状态里的 `奇遇策略: 456=2 / 789=1`、`奇遇动作: ... #888 · 第3项...` 等片段。`parseAdventureChoiceMapText()` 现在会从整行文本中提取多个 `id=choice` / `id:choice` 片段，也能从 `#id ... 第N项` 动作行提取策略；不会把 `#999 第1/3步` 这类步骤描述当作选择。该变更只增强本地策略导入和配置沉淀，不触发探索、商人购买、护道、战斗、复活、用符、用丹、奇遇或陌生道友动作。
- v2.105.0 本地验证结论：新增 `mergeAdventureStrategyImport accepts readable status strategy lines`，全量 `node --test tests/*.test.js` 为 114/114 通过；helper/loader `node --check`、manifest JSON parse 和 `git diff --check` 均通过。已同步 main repo、standalone helper 和 Windows Edge 扩展目录；本版未再次刷新真实 Edge，避免频繁接管/重载，待测试者刷新游戏页后加载。
- v2.106.0 本地候选研究结论：云游商人窗口可能已在页面渲染商品，但 `/api/game/merchant` 短暂返回空 items 或读取失败，旧逻辑会把它当成“没有商品”从而停在商人。`extractMerchantItemsFromDom()` 现在只在可见 `#merchantOverlay` 中解析商品卡片、价格和购买 index；`MerchantAutoBuyer` 在 API 空商品/失败时会使用该 DOM 兜底继续选择最高价商品。该变更仍受“仅自动探索/挂机循环时处理”和同一商人 key 去重保护，不扩大未挂机手动购物场景。
- v2.106.0 本地验证结论：新增 `extractMerchantItemsFromDom reads visible merchant cards with prices and indexes` 和 `MerchantAutoBuyer buys highest priced DOM fallback item when API has no merchant items`，目标红灯确认后实现并通过；全量 `node --test tests/*.test.js` 为 116/116 通过，helper/loader `node --check`、manifest JSON parse 和 `git diff --check` 均通过。已同步 main repo、standalone helper 和 Windows Edge 扩展目录。
- v2.106.0 只读 Edge 游戏页证据：Agent Browser CLI 接管真实 Edge profile `edge-personal-lingverse` 的 `https://ling.muge.info/game.html` 标签 `292345957`。刷新前页面为 helper/initialized `2.104.0`，AFK 关闭、自动探索未运行、自动恢复挂起 false、商人未激活；刷新后读回 helper/initialized `2.106.0`，`LingVerseAutoMapTestHooks.extractMerchantItemsFromDom` 存在，纯函数模拟最高价商品补 `index:1`，控制台 error 列表为空。extension/injected dataset 仍为 `2.99.0`，属于既有“页面已加载新版，扩展提示待下次重载统一”状态。本次只刷新游戏页、读取变量和纯函数模拟，未点击收功、探索、商人购买、护道、战斗、复活、用符、用丹、奇遇或陌生道友按钮。
- v2.107.0 本地候选研究结论：云游商人如果接口成功确认空商品，或弹窗里没有带价格的可买项，继续停在商人会浪费挂机时间。本版新增商人配置 `leaveWhenNoItems`，默认开启；确认无可买商品时调用 `/api/game/merchant/leave` 或页面 `leaveMerchant()`，清理商人窗口并复用事件恢复窗口。商人 API 读取失败仍只记录 `read-failed`，不强退，避免临时网络/API 问题导致错过商品。
- v2.107.0 本地验证结论：新增 `MerchantAutoBuyer leaves merchant when confirmed no purchasable items remain` 和 `MerchantAutoBuyer does not leave merchant on uncertain API read failures`，目标红灯确认后实现并通过；面板源码包含“无可买商品时自动离开”开关；全量 `node --test tests/*.test.js` 为 118/118 通过，helper/loader `node --check`、manifest JSON parse 和 `git diff --check` 均通过。
- v2.107.0 只读 Edge 游戏页证据：使用 Agent Browser CLI 接管真实 Edge profile `edge-personal-lingverse` 的 `https://ling.muge.info/game.html` 标签 `292345957`。刷新前确认 helper/initialized `2.106.0`、AFK 关闭、自动探索未运行、自动恢复挂起 false、商人未激活；刷新游戏页后读回 helper/initialized `2.107.0`，`MerchantAutoBuyer.leaveMerchant` 存在，页面 `leaveMerchant()` / `buyMerchantItem()` 存在，控制台 error 列表为空。extension/injected dataset 仍旧，状态报告显示“页面已加载新版，扩展提示待下次重载统一”。本次只刷新游戏页、读取变量和函数源码特征，未点击收功、探索、商人购买、商人离开、护道、战斗、复活、用符、用丹、奇遇或陌生道友按钮。
- v2.108.0 本地候选研究结论：真实商人购买可能已通过页面函数/API 触发，但商人窗口或 `_merchantActive` 没及时清掉；旧逻辑因同一 merchant key 去重会直接等待，导致挂机卡在“购买已触发但窗口仍未关闭”。本版新增商人配置 `leaveAfterPurchaseStuck`，默认开启；只有最近商人尝试为 `purchase-triggered` 且同一商品 key 仍活跃时，才调用现有 `leaveMerchant()` 收尾并进入事件恢复窗口。购买失败、读取失败、未进入自动探索/挂机上下文或关闭该开关时不自动离开。
- v2.108.0 本地验证结论：新增 `MerchantAutoBuyer leaves a still-active merchant after purchase was triggered`、`MerchantAutoBuyer does not leave a stuck post-purchase merchant when disabled` 和 `buildAfkStatusReport explains merchant leave after stuck purchases`，目标红灯确认后实现并通过；全量 `node --test tests/*.test.js` 为 121/121 通过，helper/loader `node --check`、manifest JSON parse 和 `git diff --check` 均通过。
- v2.108.0 只读 Edge 游戏页证据：使用 Agent Browser CLI 接管真实 Edge profile `edge-personal-lingverse` 的 `https://ling.muge.info/game.html` 标签 `292345957`。刷新前确认 helper/initialized `2.107.0`、AFK 关闭、自动探索未运行、自动恢复挂起 false、商人未激活；刷新游戏页后等待页面稳定，读回 helper/initialized `2.108.0`，测试钩子包含新版商人逻辑，页面 `leaveMerchant()` 存在，控制台 error 列表为空。extension/injected dataset 仍为 `2.99.0`，属于既有“页面已加载新版，扩展提示待下次重载统一”状态。本次只刷新游戏页、读取变量和状态报告纯函数，未点击收功、探索、商人购买、商人离开、护道、战斗、复活、用符、用丹、奇遇或陌生道友按钮。
- v2.109.0 本地候选研究结论：外部测试者会通过“挂机配置包”共享设置，但旧配置包只包含 `afkLoop` 和 `guardian`，不包含自动商人的购买延迟、自动上下文保护、无商品离开和购买后残留窗口离开策略。这样同一个配置包在不同浏览器里会继承各自本地商人设置，导致复现结果不一致。本版新增 `normalizeMerchantConfig()`，配置包导出 `merchant` 字段，导入时同步商人配置但仍强制关闭 `afkLoop.enabled`，旧配置包缺字段时继续兼容当前本地商人设置。
- v2.109.0 本地验证结论：新增 `AFK config packs export normalized settings and import safely`，覆盖配置包导出 `merchant`、导入同步自动商人配置且保持 AFK 默认关闭；全量 `node --test tests/*.test.js` 为 121/121 通过，helper/loader `node --check`、manifest JSON parse 和 `git diff --check` 均通过。已同步 main repo、standalone helper 和 Windows Edge 扩展目录。
- v2.109.0 只读 Edge 游戏页证据：使用 Agent Browser CLI 接管真实 Edge profile `edge-personal-lingverse` 的 `https://ling.muge.info/game.html` 标签 `292345957`。刷新前 helper 为 `2.108.0`，AFK 关闭、自动探索未运行、商人/遭遇未激活，玩家正在冥想；刷新游戏页后读回 helper/test hook 为 `2.109.0`，`normalizeMerchantConfig` 和 `buildAfkConfigPack` 均存在，纯函数生成的配置包包含 `merchant`，导入后 `afkLoop.enabled=false`，控制台 error 列表为空。extension dataset 仍显示 `2.99.0`，属于既有“页面已加载新版，扩展提示待下次重载统一”状态。本次只刷新游戏页、读取变量和纯函数模拟，未点击收功、探索、商人购买、商人离开、护道、战斗、复活、用符、用丹、奇遇或陌生道友按钮。
- v2.110.0 本地候选研究结论：测试者最常用的是“稳妥1倍 / 护道1倍 / 富裕50倍”预设按钮；旧预设只改 AFK 循环，不会固定自动商人设置，导致同样套预设时仍可能继承本机旧商人开关、延迟或离开策略。本版新增 `applyAfkAutomationPreset()`，三个预设会同时把商人配置重置为最高价购买、仅自动探索/挂机循环处理、购买延迟 800ms、无商品离开、购买后卡窗离开；未识别预设仍只归一化当前商人配置。该变更只影响本地配置应用，不新增即时商人购买、探索、冥想、护道、战斗、复活、用符、用丹或奇遇动作。
- v2.110.0 本地验证结论：新增 `applyAfkAutomationPreset includes safe merchant automation defaults`，目标红灯确认后实现并通过；全量 `node --test tests/*.test.js` 为 122/122 通过，helper/loader `node --check`、manifest JSON parse 和 `git diff --check` 均通过。已同步 main repo、standalone helper 和 Windows Edge 扩展目录。
- v2.110.0 只读 Edge 游戏页证据：使用 Agent Browser CLI 接管真实 Edge profile `edge-personal-lingverse` 的 `https://ling.muge.info/game.html` 标签 `292345957`。刷新前 helper/test hook 为 `2.109.0`，AFK 关闭、自动探索未运行，商人/遭遇只是隐藏 DOM 残留且不可见；刷新游戏页后读回 helper/test hook 为 `2.110.0`，`applyAfkAutomationPreset` 存在，纯函数模拟富裕预设输出 `exploreMultiplier=50`、`autoFight/useTalismans/useNirvanaPill=true`，并把商人配置重置为 enabled、onlyAutoExplore、800ms、leaveWhenNoItems、leaveAfterPurchaseStuck 全开启。控制台 error 列表为空。extension dataset 仍显示 `2.99.0`，但当前页面 helper 已加载新版。本次只刷新游戏页、读取变量和纯函数模拟，未点击收功、探索、商人购买、商人离开、护道、战斗、复活、用符、用丹、奇遇或陌生道友按钮。
- v2.111.0 本地候选研究结论：v2.110.0 已让预设按钮同步商人策略，但复制状态里的 `模式:` 行仍只比较 AFK 循环。这样如果测试者套用富裕预设后又关掉自动商人，状态仍可能写“已匹配富裕50倍”，复现时会漏掉商人差异。本版让 `buildAfkPresetStatus(config, merchantConfig)` 在传入商人配置时同步比较自动商人开关、自动上下文、购买延迟、无商品离开和购买后卡窗离开；复制调试摘要/状态报告会带入当前商人配置。该变更只增强诊断和复现提示，不新增任何即时游戏资源动作。
- v2.113.0 本地候选研究结论：v2.61.0 以后符箓面板未关闭会阻断迎战，这是正确的安全保护，但真实长跑可能出现“符已用完、面板仍残留、下一轮仍卡住”的情况。本版新增 `resolveCombatTalismanDialogCloseAttempt()`：只有同一遭遇、上一轮用符已完成、`dialogClosed=false`，且当前快照确认 `talismanDialogActive=true` 时，才调用页面 `hideEncounterTalismanDialog()` 或 DOM 隐藏残留面板；关闭成功后把本轮快照标记为符窗已关，再恢复后续迎战判断。快照未确认符窗可见时仍沿用旧等待保护，避免在不确定页面状态下误判。该变更只关闭残留符窗，不新增额外用符、迎战、复活、探索、商人或奇遇动作。
- v2.114.0 本地候选研究结论：真实长跑里可能出现页面 `_merchantActive` 或商人弹窗残留，但 `/api/game/merchant` 已返回“没有遇到云游商人/不在云游商人/已离开”。旧逻辑会把这种确定的“商人已不存在”也当作读取失败，导致挂机下一轮继续卡在商人阻塞。本版新增 `MerchantAutoBuyer.clearStaleMerchant()`：仅当接口明确返回商人不存在时，清理页面残留商人状态、刷新日志/玩家信息、调用原生恢复入口并打开 AFK 事件恢复窗口；临时读取异常仍保持 `read-failed`，不会强退可能有商品的商人。该变更不新增商人购买、商人离开接口调用、探索、冥想、护道、战斗、复活、用符、用丹、奇遇或道友动作。
- v2.114.0 只读 Edge 游戏页证据：真实 Edge profile `edge-personal-lingverse` 的游戏标签 `292345957` 在安全状态下刷新，刷新前 helper/initialized/hook 为 `2.112.0`、AFK 关闭、自动探索未运行、商人/遭遇/奇遇/符窗均不活跃；刷新并等待注入后 helper/initialized/hook 均为 `2.114.0`，控制台 error 为 0。extension/injected dataset 仍是旧 `2.99.0`，属于既有扩展提示滞后；当前页面 helper 已加载新版。本次未点击收功、探索、商人购买、商人离开、护道、战斗、复活、用符、用丹、奇遇或道友按钮。
- v2.115.0 本地候选研究结论：陌生道友邂逅的快照检测已经用可见性过滤，但执行器 `handlePlayerEncounter()` 仍可能优先调用隐藏残留 `#pvpEncounterModal` 的 `PvpModule.dismissEncounter()`，兜底按钮搜索也可能从隐藏容器里点到旧“离开”。本版把 PVP、邀请、会话模块入口和按钮兜底都收敛到 `isElementVisibleForAutomation()`，只处理当前可见弹窗；如果隐藏 PVP 残留和可见邀请同时存在，会优先婉拒可见邀请。该变更只降低误点旧弹窗风险，不新增陌生道友以外的探索、商人、护道、战斗、复活、用符、用丹或奇遇动作。
- v2.116.0 本地候选研究结论：`classifyExploreInterruption()` 过去只把 `神识不足` 归入回冥想，真实探索错误如果返回 `体力不足/精力不足/灵力不足` 等资源不足文案，会被当成普通 `explore-error` 暂停，导致挂机闭环断开。本版新增 `detectExploreResourceShortageNotice()`，只在探索错误消息明确包含资源不足时归类为 `noSpirit/meditate`；普通接口异常仍保持暂停，避免吞掉未知故障。该变更只调整探索中断分类，不新增探索、冥想、商人、护道、战斗、复活、用符、用丹、奇遇或道友动作。
- v2.117.0 本地候选研究结论：仅增强分类还不够，`startAutoExplore()` 调页面入口失败后原本只记录 `start-failed`，如果玩家缓存仍显示神识够，下一轮可能继续尝试启动自动探索而不是回冥想。本版把启动入口抛出的明确资源不足消息归类为 `resource-shortage`，设置短期 `exploreStartResourceShortage` 快照标记，并让 `decideAfkNextAction()` 返回 `startMeditation/explore-start-no-spirit`；普通启动失败仍保持原有失败诊断。该变更不在失败 catch 内直接点冥想，只交给统一 AFK 决策/执行器处理。
- v2.102.0 只读 Edge 游戏页证据：使用 Agent Browser CLI 接管真实 Edge profile `edge-personal-lingverse` 的 `https://ling.muge.info/game.html` 标签 `292345957`。刷新前 helper/initialized 为 `2.100.0` 且 AFK/自动探索/商人均未运行；刷新游戏页后读回 helper/initialized 为 `2.102.0`，extension/injected dataset 仍为 `2.99.0`（扩展 manifest 提示待下次重载统一），`LingVerseAutoMapTestHooks.MerchantAutoBuyer` 已存在。通过测试钩子纯函数模拟 `purchase-triggered + merchant-active`，状态报告输出 `商人: 已触发购买最高价商品 · 传说归识丹 · 9999灵石 · 页面函数` 和 `诊断归因: 云游商人购买已触发但窗口仍未关闭，等待游戏关闭商人并恢复探索`；控制台 error 列表为空。本次只刷新游戏页和读取/模拟测试钩子，未点击收功、探索、商人购买、护道、战斗、复活、用符、用丹、奇遇或陌生道友按钮。
- 页面函数：
  - `handleMeditate()`
  - `handleStopMeditate()`
  - `toggleAutoExplore(checked)`
  - `startAutoExplore()`
  - `stopAutoExplore(reason, keepResumePending)`
  - `handleExplore()`
  - `getExploreMultiplier()`
  - `setExploreMultiplierValue(value)`
  - `handleRevive()`
  - `showEncounterTalismanDialog()`
  - `useSelectedEncounterTalismans()`
  - `buyMerchantItem(index)`
  - `showAdventureStep(step)`
  - `handleAdventureChoice(adventureId, choiceIndex, choiceText, currentStep)`

只读冥想状态 API：

```json
{
  "code": 200,
  "data": {
    "isMeditating": false,
    "durationSeconds": 0,
    "maxDurationSeconds": 43200
  }
}
```

探索倍率 DOM：

- `#exploreMultiplier` 是 `DIV`。
- 当前值：`1`。
- 可选倍率：`1, 5, 10, 20, 50`。

## 源码证据

静态源码缓存：

- `/tmp/lingverse-game.js`
- `/tmp/lingverse-game-encounter.js`

冥想入口：

- `handleMeditate()` 调用 `POST /api/game/meditate/start`。
- `checkMeditationStatus()` 调用 `GET /api/game/meditate/status`。
- `handleStopMeditate()` 调用 `POST /api/game/meditate/stop`。
- `stopMeditationUI()` 只处理 UI，不负责服务端收功。

探索入口：

- `getExploreMultiplier()` 读取 `#exploreMultiplier`。
- `setExploreMultiplierValue(value)` 支持 1 到 50 倍。
- `toggleAutoExplore(true)` 会进入 `startAutoExplore()`。
- `startAutoExplore()` 要求 `#autoExploreToggle.checked === true`，所以脚本启动前要先勾上 toggle。
- `_autoExploreLoop()` 遇到死亡、遭遇、云游商人会停止自动探索并设置恢复挂起状态。

战斗与符箓：

- 遭遇面板按钮 `#encounterTalismanBtn` 调用 `showEncounterTalismanDialog()`。
- 战斗符箓列表在 `#encounterTalismanList`。
- 批量使用走 `useSelectedEncounterTalismans()`，每种符之间有节流。
- 符箓 API 本质是 `POST /api/game/use-item`。
- 背包只读样例中读到 5 种可用战斗符：
  - `talisman_ancient_4` 史诗荒古符箓
  - `bp_talisman_ghost_2` 优良冥鬼诅咒符
  - `talisman_thunder_1` 普通天雷符
  - `talisman_fire_1` 普通烈火符
  - `talisman_shield_1` 普通金刚符

涅槃/重生丹：

- `pill_nirvana_*` 在当前源码中属于回血丹系列，背包显示名为“九转还魂丹”。
- `bp_pill_rebirth_*` 对应批量分类 `five_root`，提示为“五行通灵药力会按时长排队，属性不重复叠加”，这才是富裕战斗模式要优先使用的“涅槃重生丹”。
- 当前账号背包只读检查未发现 `bp_pill_rebirth_*`，所以 v2.9.0 会在未找到满足品质的丹时跳过，不降级误吃别的丹。

死亡复活：

- `handleRevive()` 调用 `POST /api/game/revive`。
- 复活会花灵石，脚本默认关闭自动复活。

奇遇链：

- 自动探索返回 `data.adventureId` 时，页面调用 `showAdventureStep(data)` 并停止继续探索。
- 奇遇面板为 `#adventureOverlay`。
- 奇遇文本在 `#adventureStepInfo`。
- 选项容器为 `#adventureChoices`。
- 可点选项按钮为 `.adventure-choice-btn`，按钮点击后调用 `handleAdventureChoice(step.adventureId, index, choice, currentStep)`。
- 奇遇结束按钮为 `.adventure-close-btn`，常见文本为“结束奇遇”。
- 当前 DOM 没有把 `adventureId` 写到 dataset 或隐藏字段，也没有全局 `_currentAdventureStep`。
- v2.13.0 脚本通过包装 `showAdventureStep(step)` 记录最近 step，供按 ID 策略使用。
- 当前脚本不解析奇遇含义，只提供“默认暂停”“固定点击第 N 个选项”“按 adventureId 策略表”三种策略。

## 当前脚本实现

`lingverse-explore-helper.user.js` v2.8.0 新增：

- `CONFIG.afkLoop`
- `decideAfkNextAction(state, config, now)`
- `AfkLoopManager`
- 面板里的“自动挂机循环”配置区

`lingverse-explore-helper.user.js` v2.9.0 新增：

- `selectCombatTalismans(items, options)`
- `selectNirvanaRebirthPill(items, options)`
- `autoFight` 遭遇自动迎战开关
- `talismanMaxKinds` / `talismanQuantity`
- `nirvanaMinRarity` / `queueNirvanaPill`
- opt-in 的遭遇 handler：可先用符，再迎战。

`lingverse-explore-helper.user.js` v2.10.0 新增：

- `classifyExploreInterruption(data)`：把探索返回的中断状态归类。
- 自动检测奇遇链 overlay、陌生道友邂逅 modal、混天典狱区域。
- 自动复活成功后设置短暂恢复窗口：神识够则按配置倍率继续探索，神识不足则回冥想。

`lingverse-explore-helper.user.js` v2.11.0 新增：

- `autoDeclinePlayerEncounter`：陌生道友邂逅自动婉拒/离开开关，默认关闭。
- 邂逅邀请卡优先调用 `EncounterModule.respondInvite(false)`。
- 已打开邂逅会话优先调用 `EncounterModule.leave()`。
- 邂逅卡优先调用 `PvpModule.dismissEncounter()`。
- 处理成功后进入恢复窗口，让挂机循环按神识状态继续探索或回冥想。

`lingverse-explore-helper.user.js` v2.12.0 新增：

- `adventureMode`：奇遇链处理模式，默认 `pause`。
- `adventureChoiceIndex`：`fixed` 模式下点击界面第几个奇遇选项，从 1 开始。
- `decideAfkNextAction` 只有在 `adventureMode: fixed` 时才返回 `handleAdventure`。
- `AfkLoopManager.handleAdventure()` 优先点击 `.adventure-choice-btn`，没有选项但有 `.adventure-close-btn` 时关闭已完成奇遇。
- 固定序号超出当前选项数量时等待手动处理，避免自动改点其他分支。

`lingverse-explore-helper.user.js` v2.13.0 新增：

- `adventureMode: strategy`：只有当前 `adventureId` 命中策略表时才自动选择。
- `adventureChoiceMap`：`adventureId -> choiceIndex`，选择序号仍按界面顺序从 1 开始。
- 策略表输入支持 JSON：`{"456":2,"789":1}`。
- 策略表输入也支持多行文本：

```text
456=2
789:1
```

- `resolveAdventureChoiceIndex(adventureId, config)` 统一处理固定模式和策略模式。
- `installAdventureStepHook()` 包装页面 `showAdventureStep(step)`，记录最近奇遇 step，不改变页面原函数返回。
- 策略模式下未知 `adventureId` 不会自动选择，仍保持 `adventure-active` 等待。

`lingverse-explore-helper.user.js` v2.14.0 新增：

- “复制快照”按钮：从面板导出当前挂机调试 JSON。
- `buildAfkDebugSnapshot(state, config, decision, context)`：纯函数构建稳定快照。
- 快照 schema：`lingverse-afk-debug-snapshot/v1`。
- 快照字段：
  - `page`：页面标题和 URL。
  - `decision`：下一步动作和 reason。
  - `player`：神识、神识上限、单次消耗、是否死亡、是否冥想、不可探索原因。
  - `blockers`：商人、遭遇、战斗、陌生道友、奇遇、混天典狱等阻塞状态。
  - `automation`：自动探索是否运行/挂起、是否卡住、复活恢复窗口。
  - `adventure`：奇遇 ID、步骤、选项、策略模式、命中选项。
  - `config`：关键挂机配置和高风险开关状态。

`lingverse-explore-helper.user.js` v2.15.0 新增：

- 快照新增 `history.decisionTail`，最近 20 次挂机决策。
- 快照新增 `history.logTail`，最近 30 条脚本日志。
- 决策历史记录字段包括：时间、动作、reason、中文 label、神识、冥想、自动探索、事件阻塞和奇遇 ID。
- 日志历史记录字段包括：时间、类型、消息。
- 面板日志现在使用 HTML 转义，避免日志文本破坏控制面板结构。

`lingverse-explore-helper.user.js` v2.16.0 新增：

- `applyAfkPreset(config, presetName)`：生成挂机预设配置。
- `steady` 预设：1 倍探索、冥想 140 分钟、最低神识 20，关闭自动迎战/复活/用符/用丹/陌生道友自动婉拒。
- `rich` 预设：50 倍探索、冥想 140 分钟、最低神识 20，开启自动迎战/复活/用符/用丹/陌生道友自动婉拒。
- 两个预设都保留当前 `enabled` 状态和奇遇策略配置，不会自动启动挂机，也不会清空已记录的 `adventureChoiceMap`。

`lingverse-explore-helper.user.js` v2.17.0 新增：

- `talismanFamilyOrder`：战斗符箓 family 顺序/白名单配置。
- 留空时保持原选择逻辑：按 family 去重、跳过隐匿符/神行符/锁定物品，同类取最高品质，再按品质排序。
- 填写如 `ghost,fire,shield` 时，只选择这些 family，并按填写顺序使用；缺货或不可用 family 会跳过。
- 输入支持空格、英文/中文逗号、分号和 `|` 分隔，重复项会被清理。
- 已知样例 family 包括 `ancient`、`ghost`、`thunder`、`fire`、`shield`。
- 稳妥/富裕预设保留当前 `talismanFamilyOrder`，避免重置测试者的符箓偏好。

`lingverse-explore-helper.user.js` v2.18.0 新增：

- 自动探索运行或恢复挂起时，如果神识低于 `minSpirit` 或低于 `spiritCost`，决策优先回冥想。
- 自动探索恢复挂起时，如果页面 `canExplore=false` 且 `exploreDisabledReason` 包含“神识”或“体力”，决策优先回冥想。
- 保留事件阻塞优先级：混天典狱和死亡优先；其后处理奇遇、陌生道友、商人、遭遇等可恢复阻塞。
- 目的：避免 `_autoResumeExplorePending` 或自动探索运行态残留时，脚本一直等待而不进入下一轮 140 分钟冥想。

`lingverse-explore-helper.user.js` v2.19.0 新增：

- `resumeWindowSeconds`：复活、奇遇处理、陌生道友处理后的恢复窗口，默认 60 秒，可配置 0-3600 秒。
- `getResumeWindowMs(config)`：统一把恢复窗口配置转换为毫秒，复活和事件处理共用。
- 设置为 0 时关闭短恢复窗口；常规挂机 tick 仍会继续根据神识、阻塞事件和配置做决策。
- 稳妥/富裕预设保留当前 `resumeWindowSeconds`，适合慢网络或战斗结算较慢的测试者调大窗口。

`lingverse-explore-helper.user.js` v2.20.0 新增：

- `buildEncounterKey(snapshot)`：仅在 `encounterActive` 或 `combatActive` 时生成当前遭遇 key。
- 优先使用 `encounterMonsterId + encounterMonsterStage + encounterMonsterLevel`；没有怪物 ID 时使用遭遇面板前三行文本。
- `shouldUseCombatTalismansForEncounter(lastKey, snapshot)`：同一个 key 已用符则跳过，新 key 才允许用符。
- `AfkLoopManager` 记录 `lastTalismanEncounterKey`，并在离开遭遇/战斗状态后清空。
- 目的：避免同一遭遇面板卡住或 tick 重入时重复消耗战斗符箓。

`lingverse-explore-helper.user.js` v2.21.0 新增：

- `resolveCombatTalismanAttempt(lastKey, snapshot, selectedTalismans, options)`：统一决定本次遭遇是否还需要用符，以及是否要把 encounter key 标记为已处理。
- `selectedTalismans=[]` 时代表已确认没有可用符，会标记本遭遇已处理，后续 tick 不再重复读取背包。
- `attemptCompleted=true` 时代表已完成一轮用符尝试，会标记本遭遇已处理，避免同一遭遇重复尝试失败或重复消耗。
- 背包读取异常不会标记，让下一轮 tick 仍可重试。

`lingverse-explore-helper.user.js` v2.22.0 新增：

- `autoHireGuardian`：AFK 遭遇处理中的独立开关，默认关闭；v2.31.0 起开启后可独立进入遭遇 handler，不再要求同时开启自动迎战。
- `getCurrentGuardianConfig()`：优先从真实页面 `getAutoHireConfig()` 读取当前自动护道设置，页面函数不可用时回退脚本配置。
- `resolveEncounterGuardianAttempt(lastKey, snapshot, afkConfig, guardianConfig, options)`：按 encounter key 控制同一遭遇只尝试一次自动护道。
- 执行顺序：可选用符 -> 可选自动护道 -> 未开自动护道时才直接迎战。
- 自动护道成功后刷新状态并给恢复窗口；失败后不直接迎战，等待测试者手动处理。

`lingverse-explore-helper.user.js` v2.23.0 新增：

- `decideAfkNextAction` 将死亡判断提前到奇遇、陌生道友、商人、遭遇和战斗残留面板之前。
- 当 `autoRevive=true` 且 `isDead=true` 时，下一步固定为 `revive`。
- 当 `autoRevive=false` 且 `isDead=true` 时，下一步固定为 `wait/dead`，方便测试者从快照判断是复活开关未开。
- 目的：避免战死后页面残留旧遭遇或战斗 active 状态，导致脚本继续走 `handleEncounter` 而不是复活。

`lingverse-explore-helper.user.js` v2.24.0 新增：

- `isExploreStalledState(state, config, now)`：统一判断自动探索运行态和恢复挂起态是否超过 `stallTimeoutSeconds`。
- `buildSnapshot` 在 `autoExplorePending=true` 时保留上次进度时间，不再每个 tick 认为“刚刚有进展”。
- 效果：如果 `_autoResumeExplorePending` 因页面恢复函数没有成功重启探索而残留，挂机循环会按卡住判定回冥想。

`lingverse-explore-helper.user.js` v2.25.0 新增：

- `buildAfkDebugSummary(debugSnapshot)`：从完整快照生成 `lingverse-afk-debug-summary/v1` 脱敏摘要。
- “复制摘要”按钮复制摘要而不是原始完整快照，减少测试者把 URL query/hash、token/session/key 参数或过长日志原样发出的风险。
- 摘要保留当前决策、神识、阻塞状态、探索恢复状态、奇遇选项、最近 8 条决策/日志和富裕模式高风险开关。
- 完整 `buildAfkDebugSnapshot` 仍作为内部纯函数和测试 hook 保留，后续问题回放可以继续从完整 schema 扩展。

`lingverse-explore-helper.user.js` v2.26.0 新增：

- `resolveNirvanaRebirthPillAttempt(player, items, config, now)`：结构化判断探索前是否该尝试涅槃重生丹。
- 返回 reason：
  - `disabled`：用丹开关关闭。
  - `active-five-root-buff`：已有五行通灵效果且未开启排队。
  - `no-matching-pill`：背包里没有满足最低品质的五行通灵类涅槃重生丹。
  - `pill-ready`：找到满足配置的丹药，可以在启动自动探索前使用。
- `maybeUseNirvanaRebirthPill` 复用该纯函数，并记录 `lastNirvanaPillAttempt`。
- 调试快照和脱敏摘要会输出用丹尝试结果，便于测试富裕 50 倍模式时判断“为什么没吃丹”。

`lingverse-explore-helper.user.js` v2.27.0 新增：

- `postReviveResume` 和 `postInteractionResume` 分离：复活后恢复和战斗/奇遇/护道等互动后恢复在快照里不再混成一个布尔。
- `decideAfkNextAction` 对 `postInteractionResume` 单独返回 `post-interaction-ready` / `post-interaction-low-spirit`。
- `fightEncounter(cfg)` 触发迎战后调用 `schedulePostInteractionResume(cfg)`，按本轮归一化配置中的 `resumeWindowSeconds` 继续调度下一次检查。
- 目的：富裕 50 倍探索遇怪后，自动用符/迎战/结算完成时能在恢复窗口内主动回到探索，而不是等常规 tick 或被旧状态误判。

`lingverse-explore-helper.user.js` v2.28.0 新增：

- `buildAfkDebugSummary` 在 `adventure.strategyHints` 中输出当前奇遇每个选项的策略候选：
  - `choiceIndex`：界面选项序号，从 1 开始。
  - `choiceText`：脱敏/截断后的选项文本。
  - `mapLine`：可直接填入策略表的 `adventureId=choiceIndex` 行。
- 目的：测试者遇到未知奇遇时，只要复制摘要，就能快速把可选策略行沉淀到 `adventureChoiceMap`，减少手工整理成本。

`lingverse-explore-helper.user.js` v2.29.0 新增：

- `normalizeCombatTalismanAttempt(attempt)`：把最近一次战斗用符尝试规整成稳定 schema。
- `summarizeCombatTalismanAttempt(attempt)`：为脱敏摘要输出用符尝试路径、选中符箓、使用/失败数量和失败消息摘要。
- `buildAfkDebugSnapshot` / `buildAfkDebugSummary` 的 `automation.talismans` 会覆盖：
  - `disabled`：用符开关关闭。
  - `no-encounter`：当前没有可用遭遇 key。
  - `already-handled`：同一次遭遇已经处理过用符。
  - `inventory-read-failed`：读取背包失败。
  - `no-usable-talismans`：背包里没有满足配置的战斗符箓。
  - `talismans-selected`：已选出符箓但尚未完成使用。
  - `completed`：一轮用符尝试结束。
- `AfkLoopManager.lastTalismanAttempt` 在复制摘要时随 `lastNirvanaPillAttempt` 一起输出，减少富裕模式测试时翻日志的成本。

`lingverse-explore-helper.user.js` v2.30.0 新增：

- `normalizeGuardianAttempt(attempt)`：把最近一次遭遇前自动护道尝试规整成稳定 schema。
- `summarizeGuardianAttempt(attempt)`：为脱敏摘要输出护道尝试路径、当前护道设置、是否触发雇佣和失败消息摘要。
- `buildAfkDebugSnapshot` / `buildAfkDebugSummary` 的 `automation.guardian` 会覆盖：
  - `afk-guardian-disabled`：AFK 循环未开启遭遇前自动护道。
  - `guardian-config-disabled`：游戏自动护道设置关闭。
  - `no-encounter`：当前没有可用遭遇 key。
  - `guardian-already-attempted`：同一次遭遇已经尝试过护道。
  - `guardian-ready`：满足尝试条件但尚未完成。
  - `hire-triggered`：已触发页面护道按钮/函数/API。
  - `hire-failed`：尝试后未触发护道，摘要会带失败消息。
- `AfkLoopManager.lastGuardianAttempt` 在复制摘要时随用丹/用符尝试一起输出，服务低境界 1 倍护道模式测试。
- 只读 Edge 证据（2026-06-08）：灵界标签 `292345702` 存在 `tryAutoHireProtectorForEncounter` 和 `getAutoHireConfig`；当时无遭遇、无自动探索、无死亡，神识 `3/2758`，未执行资源动作。

`lingverse-explore-helper.user.js` v2.31.0 新增：

- `decideAfkNextAction` 的遭遇分支从 `autoFight` 单条件改为 `autoHireGuardian || autoFight`。
- 当只开自动护道时返回 `{ action: 'handleEncounter', reason: 'encounter-auto-guardian-enabled' }`，进入 handler 后仍由 `tryHireEncounterGuardian` 决定是否触发护道。
- 护道失败仍返回 `false` 并暂停等待手动处理，不会因为未开启自动迎战而自动开打。
- UI 文案从“迎战前按游戏护道设置自动雇护道”调整为“遭遇时按游戏护道设置自动雇护道”。
- 只读 Edge 证据（2026-06-08）：灵界标签 `292345702` 有护道函数，当前无遭遇/战斗/死亡/自动探索，神识 `3/2758`，未执行资源动作。

`lingverse-explore-helper.user.js` v2.32.0 新增：

- 自动挂机面板新增三行短状态：当前决策、上次动作、下次检查。
- `buildAfkPanelStatus(config, decisionHistory, runtime, now)` 只根据本地配置、决策历史和循环运行时生成显示文本，不调用游戏 API，不会触发资源消耗动作。
- `formatAfkReason` / `formatAfkAction` 统一面板、日志和测试里的 AFK 文案，最近一次 `handleEncounter + encounter-auto-guardian-enabled` 会显示为“处理遭遇 · 已开启遭遇前自动护道”。
- 自动测试覆盖未启动、运行中倒计时和检查中状态，方便后续改面板时避免显示回退。

`lingverse-explore-helper.user.js` v2.33.0 新增：

- `buildAfkIssueReplay(source)` 支持导入字符串 JSON、脱敏摘要或完整快照，输出 `lingverse-afk-issue-replay/v1`。
- 回放视图包含页面、决策、神识、阻塞、风险开关、护道/用符/用丹尝试摘要和奇遇策略可导入行。
- 面板新增“摘要回放”输入区，方便把其他测试者发来的摘要直接还原为可读问题视图。
- 回放仅解析本地文本，不调用游戏 API，不触发购买、探索、战斗、护道、复活、用符或用丹。
- 只读 Edge 证据（2026-06-08）：LingVerse 标签 `292345702` 仍为旧扩展实例，存在护道函数和面板，但缺少最新面板状态字段；这类版本差异也能通过回放导入摘要来定位。

`lingverse-explore-helper.user.js` v2.34.0 新增：

- `buildAfkRiskStatus(config, guardianConfig)` 生成 `lingverse-afk-risk-status/v1`，统一输出模式、风险开关计数、逐项状态和警告。
- 风险项固定为 7 个：自动迎战、自动护道、自动复活、战斗用符、涅槃重生丹、陌生道友婉拒、奇遇自动选择。
- 面板新增风险状态块，读取当前游戏护道设置后显示护道开关、战斗模式、最高费用、最低攻击和优先级。
- 脱敏摘要 `config.riskStatus` 会随摘要一起输出，测试者回传后可直接看出配置是否处在稳妥护道、富裕战斗或自定义模式。
- 只读 Edge 证据（2026-06-08）：`getAutoHireConfig()` 返回 `{ enabled: true, mode: "alone", maxFee: 51, priorityKey: "normal,incarnation,body" }`；页面有新版本提示，未执行资源动作。

`lingverse-explore-helper.user.js` v2.35.0 新增：

- `buildAfkConfigPack(config, guardianConfig, context)` 输出 `lingverse-afk-config-pack/v1`，包含规范化 AFK 配置、游戏护道设置、风险状态、创建时间和脱敏 label。
- `resolveAfkConfigPackImport(source, options)` 输出 `lingverse-afk-config-import/v1`，默认把导入配置里的 `enabled` 改为 `false` 并添加导入警告。
- 面板新增“配置包”区：复制当前配置包、导入配置包、清空输入输出。导入不调用游戏 API，不自动启动挂机。
- 配置包服务测试协作：测试者可以把“低境界护道”“富裕 50 倍”“某个奇遇策略表”等固定组合直接发回，开发侧可复现同一组开关。

`lingverse-explore-helper.user.js` v2.36.0 新增：

- `mergeAdventureStrategyImport(config, source)` 从摘要回放、调试摘要或纯文本里提取奇遇策略行，合并进 `adventureChoiceMap`。
- 面板“摘要回放”区新增“导入策略”，测试者粘贴反馈后可以把未知奇遇的 `strategyHints.mapLine` 直接沉淀为策略表。
- 导入策略时会关闭 `enabled`，仅保存本地配置，不调用游戏 API，不触发购买、探索、战斗、护道、复活、用符或用丹。

`lingverse-explore-helper.user.js` v2.37.0 新增：

- `resolveAfkResourceBudget(kind, config, usage)` 统一计算单次挂机启动后的资源上限状态。
- 新增 `reviveMaxPerRun`、`talismanMaxEncountersPerRun`、`nirvanaMaxPerRun`；面板可配置，`0` 表示不限。
- 富裕 50 倍预设默认复活 1 次、用符 3 场、用丹 1 次。达到上限后对应动作只记录 `budget-exhausted` 并跳过，不调用资源消耗 API。
- 风险预检会显示资源上限；运行中达到上限时显示警告，方便测试者截图或复制摘要反馈。

`lingverse-explore-helper.user.js` v2.38.0 新增：

- `buildAfkStatusReport(source)` 从脱敏摘要或完整快照生成 `lingverse-afk-status-report/v1`。
- 报告是可直接粘贴的文本，覆盖版本、页面、神识、当前决策、阻塞、探索状态、冥想/探索配置、资源用量、风险摘要和奇遇策略候选行。
- 面板新增“复制状态”按钮，服务测试群快速沟通；“复制摘要”仍用于开发侧 JSON 回放和策略导入。
- 状态报告生成过程只读取快照/摘要，不调用游戏资源动作。

`lingverse-explore-helper.user.js` v2.39.0 新增：

- `buildAfkWaitingDiagnosis(decisionHistory, config, now)` 从最近决策历史诊断重复等待：连续相同 `action/reason` 达到阈值后，输出 `lingverse-afk-wait-diagnosis/v1`。
- 默认把冥想、自动探索运行视为正常等待；奇遇、遭遇、陌生道友、死亡、混天典狱、资源上限耗尽、当前区域不可探索等等待会在持续过久时给出处理建议。
- `buildAfkDebugSnapshot` 写入 `automation.waitDiagnosis`；`buildAfkDebugSummary` 脱敏保留；`buildAfkStatusReport` 在诊断激活时追加 `诊断:` 行。
- 诊断只读取决策历史、配置和时间戳，不调用探索、购买、战斗、护道、复活、用符或用丹。

`lingverse-explore-helper.user.js` v2.40.0 新增：

- `detectGameUpdateNotice(text)` 识别真实 Edge 只读观察到的更新提示：`灵界已更新新版本，请点此刷新...`。
- 快照新增 `blockers.gameUpdateNoticeActive`；摘要和可读状态报告会显示“游戏更新”阻塞。
- 决策优先级：配置未启用后先检查游戏更新提示。默认 `autoReloadOnUpdate=false` 时等待；显式开启后才返回 `reloadPage`。
- `reloadPage` 执行器只调用页面刷新，不调用探索、购买、战斗、护道、复活、用符或用丹。

`lingverse-explore-helper.user.js` v2.41.0 新增：

- `automation.fight` 记录自动迎战尝试，包含 `shouldAttempt`、`reason`、`encounterKey`、`source` 和 `failureMessage`。
- `source` 区分按钮点击、页面函数、后备 API 和异常路径，方便判断 50 倍模式在用符后是否真的触发迎战。
- `failureMessage` 和 `encounterKey` 进入摘要前会走同一套脱敏/截断逻辑，避免 token、session、query/hash 泄露。
- `buildAfkStatusReport` 的“自动化”行新增“迎战 reason”，测试者复制状态即可反馈迎战是否触发或失败。
- 该字段是报告层补充；不开 `autoFight` 时只记录 `disabled`，不会触发战斗。

`lingverse-explore-helper.user.js` v2.42.0 新增：

- `buildAfkPhaseStatus(state, config, decision, now)` 生成 `lingverse-afk-phase-status/v1`，只读描述当前挂机阶段。
- 冥想阶段记录 `elapsedSeconds`、`remainingSeconds`、`targetSeconds`，并明确“满神识提前结束”，帮助验证自定义 140 分钟循环。
- 探索阶段记录探索倍率和卡住判定秒数；阻塞阶段记录当前决策原因；恢复窗口阶段说明神识足够继续探索、不足回冥想。
- `buildAfkDebugSnapshot` / `buildAfkDebugSummary` 新增 `phase`；旧摘要没有 `phase` 时，`buildAfkStatusReport` 会从 player/blocker/automation/config/decision 补算。
- `buildAfkStatusReport` 新增“阶段:”行，测试者复制状态时能直接看到冥想/探索/阻塞/恢复进度。
- `window.LingVerseAutoMapVersion` 和测试 hook 暴露当前版本，便于用 Agent Browser CLI 只读核对真实页面是否加载最新版。
- 阶段报告不参与决策，不调用任何游戏 API，不触发资源动作。

`lingverse-explore-helper.user.js` v2.43.0 新增：

- `buildAfkResourcePreflight(items, config, player, now, usage)` 生成 `lingverse-afk-resource-preflight/v1`，只读分析富裕模式资源。
- 战斗符箓预检复用 `selectCombatTalismans`，按 `talismanMaxKinds`、每类数量和 family 顺序输出可用 family、选中符箓和不足 warning。
- 涅槃重生丹预检复用 `resolveNirvanaRebirthPillAttempt`，继续只匹配 `bp_pill_rebirth_*` 或明确“五行通灵/涅槃重生丹”的 pill，不匹配 `pill_nirvana_*` 九转还魂丹。
- 复制状态/复制摘要在开启 `useTalismans` 或 `useNirvanaPill` 时只读一次背包；读取失败只写 warning，不影响复制，不调用 `useItem`。
- 调试摘要新增 `automation.resourcePreflight`；可读状态报告新增“预检:”行和预检 warning。

`lingverse-explore-helper.user.js` v2.44.0 新增：

- `applyAfkPreset(config, 'guardian')` 生成低境界护道 1 倍预设：1 倍探索、开启 `autoHireGuardian`，关闭自动迎战、复活、战斗用符、涅槃重生丹和陌生道友自动婉拒。
- 面板新增“套用护道1倍”，仍只保存配置，不自动启动挂机。
- `buildAfkStatusReport` 新增“护道:”行，把 `automation.guardian.reason` 翻译为中文，并带上失败消息、游戏护道开关、作战模式、最高费用、最低攻击力和优先级。
- 目的：低境界测试者不用手动组合多个高风险开关；卡在遭遇时复制状态也能直接看出是游戏护道设置关闭、已触发、已失败，还是本遭遇已尝试过。

`lingverse-explore-helper.user.js` v2.45.0 新增：

- `buildAfkEnvironmentStatusLine(summary)` 从摘要的 `scriptVersion` 和 `blockers.gameUpdateNoticeActive` 生成只读环境提示。
- 当游戏更新 blocker 存在时，`buildAfkStatusReport` 会插入 `环境: helper x.y.z · 游戏更新提示，先刷新页面/重载扩展`。
- 目的：真实测试时常见“游戏页面提示更新、扩展脚本版本未刷新”的情况可以直接从状态报告看出，减少误判为挂机逻辑问题。
- v2.71.0 起，该环境提示也覆盖 helper/扩展版本不一致，优先提示重载扩展并刷新页面。

`lingverse-explore-helper.user.js` v2.46.0 新增：

- `buildAfkAdventureStatusLine(summary)` 从摘要中的 `adventure.id`、`step`、`totalSteps`、`choices` 生成可读奇遇样本行。
- `buildAfkStatusReport` 会在策略候选行之前输出 `奇遇: #ID 第x/y步 · 1.选项 / 2.选项`。
- 目的：测试者只复制可读状态时，也能把真实奇遇链的 ID、步骤和选项文本回传给开发侧，用于后续沉淀 `adventureChoiceMap`。
- 该行只读派生，不调用 `handleAdventureChoice`，不自动导入策略，不改变奇遇默认暂停原则。

`lingverse-explore-helper.user.js` v2.47.0 新增：

- `AfkLoopManager.buildSnapshot()` 记录 `postReviveResumeRemainingSeconds` 和 `postInteractionResumeRemainingSeconds`。
- `buildAfkPhaseStatus` 在恢复窗口阶段输出剩余秒数、恢复窗口目标秒数，以及“神识足够将继续 N 倍探索 / 神识不足将回冥想”的下一步倾向。
- `buildAfkStatusReport` 新增 `恢复:` 行，直接复用 phase 文案。
- 目的：富裕 50 倍遇怪链路中，自动用符/迎战/复活/奇遇处理后经常需要等待页面结算；测试者复制状态时可直接判断是在恢复窗口内等待，还是已经脱离窗口需要继续排障。

`lingverse-explore-helper.user.js` v2.48.0 新增：

- `buildAfkMeditationReturnStatusLine(summary)` 从脱敏摘要只读生成 `回冥想:` 行。
- `buildAfkStatusReport` 在下一步为 `startMeditation` 且原因属于低神识/神识不足/探索卡住时输出 `回冥想: 原因 · 当前x/y · 单次z · 阈值n`。
- 覆盖原因包括 `auto-explore-low-spirit`、`explore-disabled-no-spirit`、`spirit-below-threshold`、`post-revive-low-spirit`、`post-interaction-low-spirit` 和 `explore-stalled`。
- 目的：真实挂机测试里最常见的“自动探索停住”可先被区分为正常回冥想闭环，不需要测试者翻 JSON 或日志。

`lingverse-explore-helper.user.js` v2.49.0 新增：

- `buildAfkGuardianAdviceStatusLine(attempt)` 从脱敏摘要只读生成 `护道建议:` 行。
- `buildAfkStatusReport` 在 `automation.guardian` 表示游戏护道关闭、护道失败、本遭遇已尝试、可尝试/已触发时输出下一步建议。
- 护道失败建议会带出最高费用和最低攻击力，方便测试者直接判断是否要调高费用、补灵石、降低最低攻击力或手动处理当前遭遇。
- 目的：护道 1 倍预设卡在遭遇时，状态报告同时给“发生了什么”和“下一步怎么排障”，减少低境界测试者反复截图/翻日志。

`lingverse-explore-helper.user.js` v2.50.0 新增：

- `buildAfkFightStatusLine(attempt)` 从脱敏摘要只读生成 `迎战:` 行，展示自动迎战结果、触发来源和脱敏失败消息。
- `buildAfkFightAdviceStatusLine(attempt)` 生成 `迎战建议:` 行，覆盖失败、尚未迎战和已触发自动迎战。
- 触发来源会翻译为遭遇按钮、页面函数、接口或异常，帮助测试者判断是 UI 按钮不可点、页面函数失败，还是 API 返回错误。
- 目的：富裕 50 倍“用符 -> 迎战 -> 结算/复活/恢复”链路中，测试者只发可读状态也能说明是否走到迎战这一步。

`lingverse-explore-helper.user.js` v2.51.0 新增：

- `buildAfkTalismanStatusLine(attempt)` 从脱敏摘要只读生成 `用符:` 行，展示战斗用符结果、成功/失败 family 数、选中 family 和脱敏失败消息。
- `buildAfkTalismanAdviceStatusLine(attempt)` 生成 `用符建议:` 行，覆盖部分失败、背包读取失败、无可用符、次数上限、已选中待执行、本遭遇已处理和已完成等状态。
- 目的：富裕 50 倍“用符 -> 迎战”链路中，测试者只复制可读状态即可判断问题停在用符、迎战还是后续恢复；该行只读派生，不调用背包、用符、迎战、复活或用丹 API。

`lingverse-explore-helper.user.js` v2.52.0 新增：

- `buildAfkNirvanaPillStatusLine(attempt)` 从脱敏摘要只读生成 `用丹:` 行，展示涅槃重生丹决策/执行结果、丹药品质、丹药名和脱敏失败消息。
- `buildAfkNirvanaPillAdviceStatusLine(attempt)` 生成 `用丹建议:` 行，覆盖已有五行通灵、次数上限、背包读取失败、未找到满足品质丹药、找到可用丹药、已使用和使用失败。
- `normalizeNirvanaPillAttempt` / `summarizeNirvanaPillAttempt` 保留 `failureMessage`；`maybeUseNirvanaRebirthPill` 会在背包读取失败、用丹失败和用丹成功时更新 `lastNirvanaPillAttempt`。
- 目的：富裕 50 倍“用丹 -> 探索 -> 用符 -> 迎战”链路中，测试者只复制可读状态即可判断是否卡在探索前用丹阶段；报告行只读派生，不额外调用背包、用符、迎战、复活或用丹 API。

`lingverse-explore-helper.user.js` v2.53.0 新增：

- `normalizeReviveAttempt` / `summarizeReviveAttempt` 记录自动复活尝试，包含 `shouldAttempt`、`reason`、`source` 和脱敏 `failureMessage`。
- `buildReviveDebugAttempt` 从快照/配置推断复活关闭、未死亡、上限耗尽和准备复活；真实执行路径会在上限、成功触发和异常失败时更新 `lastReviveAttempt`。
- `buildAfkReviveStatusLine(attempt)` / `buildAfkReviveAdviceStatusLine(attempt)` 从脱敏摘要只读生成 `复活:` / `复活建议:` 行。
- 目的：富裕 50 倍“战斗 -> 死亡 -> 自动复活 -> 恢复窗口”链路中，测试者只复制可读状态即可判断是否卡在复活阶段；报告行只读派生，不额外调用复活 API。

`lingverse-explore-helper.user.js` v2.54.0 新增：

- `normalizeExploreStartAttempt` / `summarizeExploreStartAttempt` 记录自动探索启动尝试，包含 `shouldAttempt`、`reason`、`multiplier`、`source` 和脱敏 `failureMessage`。
- `buildExploreStartDebugAttempt` 从快照/配置/决策推断挂机关闭、无需启动、已运行和准备启动；真实执行路径会在准备启动、成功触发和异常失败时更新 `lastExploreStartAttempt`。
- `buildAfkExploreStartStatusLine(attempt)` / `buildAfkExploreStartAdviceStatusLine(attempt)` 从脱敏摘要只读生成 `探索启动:` / `探索建议:` 行。
- 目的：富裕 50 倍“用丹 -> 自动探索启动 -> 事件/战斗 -> 恢复窗口 -> 继续探索”链路中，测试者只复制可读状态即可判断是否卡在倍率控件或自动探索入口；报告行只读派生，不额外调用探索 API。

`lingverse-explore-helper.user.js` v2.55.0 新增：

- `normalizeMerchantAttempt` / `summarizeMerchantAttempt` 记录自动商人尝试，包含 `shouldAttempt`、`reason`、`source`、商品 index/name/price 和脱敏 `failureMessage`。
- `MerchantAutoBuyer.lastAttempt` 会记录读商人失败、无可买商品、准备购买、页面函数/API 触发购买、购买失败、准备离开、已离开和离开失败。
- `buildAfkMerchantStatusLine(attempt)` / `buildAfkMerchantAdviceStatusLine(attempt)` 从脱敏摘要只读生成 `商人:` / `商人建议:` 行。
- 目的：云游商人导致自动探索暂停时，测试者只复制可读状态即可判断是否已经买了最高价商品、失败原因是灵石/API/窗口问题，还是需要手动关闭商人；报告行只读派生，不额外调用商人 API。

`lingverse-explore-helper.user.js` v2.56.0 新增：

- `normalizeMeditationAttempt` / `summarizeMeditationAttempt` 记录冥想执行尝试，包含 `start/stop` 动作、`reason`、`source`、计划分钟、已冥想秒数和脱敏 `failureMessage`。
- `buildMeditationDebugAttempt` 从快照/配置/决策推断准备进入冥想、准备结束冥想、冥想中或无需冥想；真实 `startMeditation` / `stopMeditation` 会记录触发来源和失败原因。
- `buildAfkMeditationStatusLine(attempt)` / `buildAfkMeditationAdviceStatusLine(attempt)` 从脱敏摘要只读生成 `冥想:` / `冥想建议:` 行。
- 目的：2小时20分钟冥想周期的核心闭环可直接从状态报告判断是否成功进入冥想、是否按时收功、是否卡在页面冥想按钮或 API；报告行只读派生，不额外调用冥想 API。

`lingverse-explore-helper.user.js` v2.57.0 新增：

- `buildAfkPresetStatus(config)` 生成 `lingverse-afk-preset-status/v1`，比较当前配置和稳妥 1 倍、护道 1 倍、富裕 50 倍预设的关键开关。
- 调试摘要 `config.presetStatus` 会输出 `match`、`closestPreset`、`mismatchTexts` 和可读 `lineText`。
- `buildAfkStatusReport` 在 `配置:` 后追加 `模式:` 行，帮助测试者确认当前配置是否仍匹配某个预设；偏离时只列关键差异，不把可自定义的冥想时间、最低神识、恢复窗口或奇遇策略误判为错误。
- 目的：多人测试时减少“都说是富裕模式，但有的人没开复活/用符/用丹”这类配置漂移噪音；报告行只读派生，不调用游戏 API。

`lingverse-explore-helper.user.js` v2.58.0 新增：

- `normalizeCombatTalismanAttempt` 新增 `dialogClosed`、`dialogCloseSource`、`dialogCloseFailureMessage` 三个字段。
- `summarizeCombatTalismanAttempt` 会脱敏并保留符箓面板关闭来源和关闭失败消息。
- 真实 `useCombatTalismans` 用符结束后会尝试调用 `hideEncounterTalismanDialog()`，没有页面函数时用 DOM `hidden` 兜底；关闭失败会写入最近一次用符尝试。
- `buildAfkTalismanStatusLine` / `buildAfkTalismanAdviceStatusLine` 会在可读状态中显示“符窗已关闭/符窗未关闭”和关闭失败建议。
- 目的：富裕 50 倍“用符 -> 关闭符箓面板 -> 迎战”链路中，如果符箓面板没有关掉，测试者只复制状态即可定位卡点；报告行只读派生，不额外调用背包、用符、迎战、复活或用丹 API。

`lingverse-explore-helper.user.js` v2.59.0 新增：

- `buildAfkWaitingDiagnosis` 新增 `likelyCause`，重复等待或重复自动处理达到阈值后，会从最近的冥想、商人、探索启动、用丹、用符、迎战、复活、护道尝试里推断可能根因。
- `buildAfkDebugSnapshot` 调用等待诊断时传入当前快照、当前决策和最近自动化尝试；`buildAfkDebugSummary` 会脱敏保留 `likelyCause`。
- `buildAfkStatusReport` 在 `诊断:` 后追加 `诊断归因:`，比如 `符箓面板未关闭 · close failed token=<redacted>`。
- 目的：长跑测试出现“同一个等待/自动处理持续多次”时，测试者不用人工串联“护道/用符/迎战/复活/商人/探索启动”各行，状态报告会直接给出最可能卡点；归因只读，不额外调用游戏 API，也不强制迎战、复活或继续探索。

`lingverse-explore-helper.user.js` v2.60.0 新增：

- `resolveEncounterFightAttempt(lastEncounterKey, snapshot, config, options)` 用 `buildEncounterKey` 判断是否还应触发自动迎战。
- `fightEncounter` 成功触发按钮、页面函数或 API 迎战后记录 `lastFightEncounterKey`；同一 encounter key 后续只记录 `fight-already-triggered` 并等待结算。
- `executeDecision` 在不再处于遭遇/战斗状态时清空 `lastFightEncounterKey`，确保下一次新遭遇仍会自动迎战。
- 目的：富裕 50 倍遇怪后，页面结算、恢复窗口或旧遭遇面板残留期间不会重复点击迎战；该去重只限制同一遭遇，不能跨新怪。

`lingverse-explore-helper.user.js` v2.61.0 新增：

- `resolveEncounterFightAttempt(lastEncounterKey, snapshot, config, options)` 会读取 `options.talismanAttempt`；当前遭遇最近一次用符记录为 `dialogClosed === false` 时返回 `talisman-dialog-open`。
- `fightEncounter` 在真实执行前把 `lastTalismanAttempt` 传入迎战决策；符箓面板未关闭时不会点击 `#encounterFightBtn`、不会调用 `handleCombatChoice('fight')`，也不会调用 `API.combatChoice('fight')`。
- `buildEncounterFightDebugAttempt` 可从最近用符尝试推断迎战阻断；`buildAfkFightStatusLine` / `buildAfkFightAdviceStatusLine` 会显示 `迎战: 符箓面板未关闭` 和对应处理建议。
- 目的：把 v2.58.0 的“符窗未关闭”观测升级成自动迎战前的硬阻断，避免富裕 50 倍链路中被面板遮挡时误点或误调用；该逻辑只阻断迎战，不主动强制关闭面板，也不额外消耗资源。

`lingverse-explore-helper.user.js` v2.62.0 新增：

- `buildSnapshot` 新增 `talismanDialogActive`，从 `#encounterTalismanDialog` 是否存在且未 `hidden` 派生当前符箓面板可见状态。
- `buildAfkDebugSnapshot` / `buildAfkDebugSummary` 在 `blockers.talismanDialogActive` 中保留该只读状态。
- `resolveEncounterFightAttempt` 的符窗判断优先级为：当前快照显示打开 -> 阻断迎战；当前快照显示关闭 -> 放行到正常迎战判断；快照未知 -> 回退到最近用符尝试的 `dialogClosed=false` 记录。
- 目的：避免 v2.61.0 的硬阻断在测试者手动关闭符箓面板后仍被旧失败记录卡住，同时在真实 DOM 显示符箓面板仍打开时继续避免误点迎战。

`lingverse-explore-helper.user.js` v2.63.0 新增：

- `normalizeMeditationAttempt` 新增 `triggerReason`，用于保留 `stopMeditation` 的上游决策原因。
- `buildMeditationDebugAttempt` 在准备收功时把 `decision.reason` 写入 `triggerReason`；真实 `stopMeditation` 执行路径在 `stop-ready`、`stop-triggered`、`stop-failed` 三种记录里也保留该字段。
- `buildAfkMeditationStatusLine` 会把 `spirit-full` 显示为“神识已满”，把 `meditation-duration-reached` 显示为“冥想时长已到”；`buildAfkMeditationAdviceStatusLine` 给出对应收功建议。
- 目的：测试 2小时20分钟闭环时，复制状态不只显示“准备结束冥想”，还能看出是满神识提前收功还是计划时长到点收功；该字段只读派生，不额外调用冥想 API。

`lingverse-explore-helper.user.js` v2.64.0 新增：

- `buildAfkWaitLikelyCause` 对 `post-interaction-ready` / `post-revive-ready` 的重复 `startAutoExplore` 失败增加专属归因。
- 当最近 `exploreStartAttempt.reason === 'start-failed'` 时，状态报告会把 `诊断归因:` 写成“事件恢复后未能重启探索 · 自动探索启动失败 · ...”或“复活恢复后未能重启探索 · 自动探索启动失败 · ...”。
- `getAfkWaitingDiagnosisMeta` 为恢复窗口重复启动探索失败提供专属建议，提示检查自动探索入口/倍率控件、必要时手动点一次自动探索并复制摘要。
- 目的：富裕 50 倍处理完战斗/奇遇/护道后，如果恢复窗口一直到期但没有真正续上探索，测试者复制状态即可区分是恢复窗口还在等、自动探索入口失败，还是其他阻塞；该逻辑只读归因，不额外点击探索、战斗、复活、用符或用丹。

`lingverse-explore-helper.user.js` v2.65.0 新增：

- `buildAfkWaitLikelyCause` 对 `guardian-already-attempted` 增加专属归因：“本遭遇已尝试自动护道，避免重复扣费”。
- 对 `hire-triggered` 增加只读归因：“自动护道已触发，等待遭遇结算”。
- `getAfkWaitingDiagnosisMeta` 为 `encounter-auto-guardian-enabled` 增加专属建议，提示确认护道结算或手动处理当前遭遇，并复制摘要。
- 目的：低境界护道 1 倍长跑时，测试者看到遭遇面板停住后能知道脚本是故意不重复雇佣，避免重复扣费，而不是漏掉再次点击；该逻辑只读归因，不额外调用自动护道、迎战或探索。

`lingverse-explore-helper.user.js` v2.66.0 新增：

- `buildAfkWaitLikelyCause` 对 `handleAdventure` / `adventure-auto-choice` / `adventure-strategy-choice` 的重复等待增加专属归因。
- 归因会读取当前快照里的 `adventureId`、`adventureChoices` 和挂机配置里的固定/策略选择，显示例如“奇遇#456 自动选择第2项「绕路离开」后仍未前进”。
- `getAfkWaitingDiagnosisMeta` 为奇遇自动选择重复未前进增加专属建议，提示检查当前奇遇选项/策略是否匹配，必要时手动处理并复制摘要。
- 目的：测试者配置奇遇策略后，如果页面未推进或选项变化，复制状态就能知道是哪条策略卡住；该逻辑只读归因，不额外点击奇遇选项，也不自动改策略表。

`lingverse-explore-helper.user.js` v2.67.0 新增：

- `buildAfkWaitLikelyCause` 对 `handlePlayerEncounter` / `player-encounter-auto-decline` 的重复等待增加专属归因。
- 当自动婉拒开启但 `playerEncounterActive` 仍为 true 时，状态报告会显示“陌生道友自动婉拒后仍未关闭”。
- `getAfkWaitingDiagnosisMeta` 为陌生道友自动婉拒重复未前进增加专属建议，提示检查邂逅弹窗/按钮，必要时手动处理并复制摘要。
- 目的：富裕 50 倍模式开启陌生道友自动婉拒后，如果页面弹窗结构变化或按钮未命中，测试者复制状态即可定位是婉拒链路卡住；该逻辑只读归因，不额外点击邂逅按钮。

`lingverse-explore-helper.user.js` v2.68.0 新增：

- `automation.playerEncounter` 进入 `buildAfkDebugSnapshot`、`buildAfkDebugSummary`、`buildAfkStatusReport` 和摘要回放自动化概览。
- `handlePlayerEncounter` 会记录自动婉拒的准备、触发和失败结果；来源包括邂逅卡关闭、邀约婉拒、会话离开、弹窗按钮、缺少入口和异常。
- 状态报告新增“陌生道友:”和“陌生道友建议:”行，失败消息沿用摘要脱敏规则。
- 目的：测试者第一次复制状态就能知道陌生道友自动婉拒是否触发，以及卡在页面函数、按钮入口还是异常；该变更只增加报告，不增加重复点击或资源动作。

`lingverse-explore-helper.user.js` v2.69.0 新增：

- `automation.adventureAttempt` 进入 `buildAfkDebugSnapshot`、`buildAfkDebugSummary`、`buildAfkStatusReport` 和摘要回放自动化概览。
- `handleAdventure` 会记录自动选择/关闭的准备、触发和失败结果；来源包括选项按钮、关闭按钮、缺少奇遇面板、策略未命中、选项不可点、缺少入口和异常。
- 状态报告新增“奇遇动作:”和“奇遇建议:”行，包含奇遇 ID、选项序号、选项文本、触发来源和脱敏失败消息。
- 目的：测试者第一次复制状态就能知道奇遇策略是否命中、准备点击哪一项、是否已触发，或是否卡在按钮/策略入口；该变更只增加报告，不增加重复点击或自动改策略。

`lingverse-explore-helper.user.js` v2.95.0 新增：

- `AfkLoopManager.lastAdventureChoiceKey` 记录最近一次已触发的奇遇选择键，同一个奇遇 ID、步骤、总步数和选项不会重复触发。
- `handleAdventure` 对重复键记录 `choice-already-triggered`，状态报告输出“奇遇动作: 本步已触发自动选择”和等待页面推进/手动处理建议。
- 当奇遇不再激活或完成奇遇被关闭时清空去重键；步骤变化后同一策略项可以重新执行。
- 目的：策略表命中的奇遇仍可自动处理，但页面未推进时不连续点击同一个按钮，减少重复提交风险，也让测试者能从复制状态判断脚本正在等页面推进。

`lingverse-explore-helper.user.js` v2.96.0 新增：

- `AfkLoopManager.buildSnapshot()` 不再只因 `_lastPlayerData` 存在就跳过玩家信息接口；每轮先尝试 `/api/player/info`，成功后使用新鲜玩家数据并同步缓存。
- API 读取失败时仍回退 `_lastPlayerData`，保持离线/接口短暂失败时的面板可用性。
- 目的：神识、死亡、冥想、探索可用性等挂机关键输入尽量来自最新只读玩家信息，避免旧缓存让低神识回冥想决策滞后。

`lingverse-explore-helper.user.js` v2.70.0 新增：

- `buildAfkHardStopStatusLine` / `buildAfkHardStopAdviceStatusLine` 对 `immortalPrisonActive` 输出即时 hard-stop 状态。
- 状态报告会显示“硬停: 混天典狱 · 脚本暂停自动探索”和“硬停建议: 混天典狱需要手动处理 · 脚本不会自动跳过、自动点击或消耗资源”。
- 目的：混天典狱属于不可安全自动跳过的 hard-stop；测试者第一次复制状态就能知道脚本是主动停住，不是低神识、商人、奇遇、战斗或恢复窗口故障。

`lingverse-explore-helper.user.js` v2.71.0 新增：

- `lingverse-extension-loader.js` 会把扩展 manifest 版本写到 `document.documentElement.dataset.lingverseAutoMapExtensionVersion`，并给注入脚本 URL 添加版本查询参数。
- `buildAfkDebugSnapshot` / `buildAfkDebugSummary` 保留 `environment.extensionVersion` 和 `versionMismatch`。
- `buildAfkEnvironmentStatusLine` 在 helper/扩展版本不一致时输出“环境: helper ... · 扩展 ... · 版本不一致，重载扩展并刷新页面”。
- 目的：外部测试者安装、重载或刷新步骤不一致时，状态报告能先暴露环境问题；该变更不增加任何探索、购买、战斗、复活或消耗品动作。

`lingverse-explore-helper.user.js` v2.72.0 新增：

- 首次初始化面板时写入 `window.LingVerseAutoMapInitializedVersion`。
- `buildAfkDebugSnapshot` / `buildAfkDebugSummary` 的 `environment` 保留面板初始化版本、是否已初始化、初始化版本是否落后和已初始化但版本未知状态。
- `buildAfkEnvironmentStatusLine` 在 helper 顶层版本和面板初始化版本不一致时提示“页面仍是旧初始化，刷新页面”；已初始化但无版本记录时提示“面板版本未知”。
- 目的：扩展重载后可能只更新了顶层脚本和测试 hook，旧面板事件监听仍在页面中；该提示能阻止测试者把旧面板行为误判为新版挂机逻辑。

`lingverse-explore-helper.user.js` v2.73.0 新增：

- `parseMeditationBarState(text)` 解析真实页面 `#meditationBar` 当前文本，识别“冥想修炼中”和类似 `1时30分` 的已冥想时长；若冥想条被压成一行，会避开“最长12小时”并从正文中提取真实已冥想时长。
- `readMeditationBarState()` 只读当前 `#meditationBar`，用于 `AfkLoopManager.buildSnapshot` 在冥想接口或 `_lastPlayerData` 缓存不同步时兜底设置 `isMeditating` 和 `meditationDurationSeconds`。
- 该兜底只读取 DOM，不点击“收功”或调用冥想/探索接口；真正是否收功仍由 `decideAfkNextAction` 根据自定义 `meditationMinutes`、神识是否已满和现有 `stopMeditation` 执行链决定。
- 自动测试覆盖当前冥想条文本和聊天历史“收功/修炼时长”误判防护。
- 真实 Edge 只读证据（2026-06-08）：标签 `292345702` 仍加载旧 helper `2.58.0`，页面可见 `#meditationBar` “冥想修炼中 (最长12小时) / 1时30分 / 收功”，但 `_lastPlayerData.isMeditating=false`；这解释了为什么需要 DOM 兜底，且本次未触发任何资源动作。

`lingverse-explore-helper.user.js` v2.74.0 新增：

- `decideAfkNextAction` 在 `snapshot.canExplore === false` 且 `exploreDisabledReason` 没有“神识/体力”文字时，也会检查 `lowSpirit`。
- 如果神识低于 `minSpirit` 或低于当前 `spiritCost`，直接返回 `startMeditation / explore-disabled-no-spirit`。
- 目的：低神识长跑时，页面禁用探索但没有给明确禁用原因，也不会停在 `wait/explore-disabled`；这更符合“神识小于阈值就回冥想”的挂机目标。
- 该变更只改变状态机下一步决策，不新增探索、商人、护道、战斗、复活、用符、用丹或奇遇点击动作。

`lingverse-explore-helper.user.js` v2.75.0 新增：

- `parseMeditationBarState(text)` 解析冥想条恢复行中的 `recoveredSpirit`，例如 `恢复: 5,794血 / 3,002灵 / 914识`。
- `AfkLoopManager.buildSnapshot` 在当前冥想条可见且 `_lastPlayerData.isMeditating=false` 时，将恢复神识作为 `meditationRecoveredSpirit`，并设置 `meditationSpiritFromBar=true`。
- `decideAfkNextAction` / `buildAfkPhaseStatus` 在 `meditationSpiritFromBar=true` 时，用 `spirit + meditationRecoveredSpirit` 作为满神识判断兜底。
- 目的：真实页面里冥想恢复量已经增长，但玩家缓存仍停在冥想前神识时，仍可按“神识满提前收功”目标工作。
- 该变更只读解析冥想条，不直接点击 `收功`；收功仍必须通过现有 `stopMeditation` 决策和执行链。

`lingverse-explore-helper.user.js` v2.76.0 新增：

- `buildAfkDebugSummary` 的 `player` 保留 `meditationRecoveredSpirit` 和 `meditationSpiritFromBar`。
- `buildAfkStatusReport` 在冥想条恢复兜底激活时追加 `冥想兜底:` 行，例如 `冥想条恢复97识 · 缓存3/100 · 估算100/100`。
- 目的：测试者复制状态时能看见“缓存神识低但脚本认为神识已满”的依据，减少误判为乱收功。
- 该变更只增加脱敏摘要和可读状态报告，不新增收功、探索、商人、护道、战斗、复活、用符、用丹或奇遇点击动作。

`lingverse-explore-helper.user.js` v2.77.0 新增：

- `AfkLoopManager.stopMeditation` 成功触发收功后打开 `postMeditationResume` 恢复窗口，窗口时长复用 `resumeWindowSeconds`。
- `decideAfkNextAction` 在 `postMeditationResume=true` 且页面没有明确 `canExplore=false` 时返回 `startAutoExplore/post-meditation-ready`，避免玩家缓存仍显示低神识时又立刻回冥想。
- `buildAfkPhaseStatus` / `buildAfkStatusReport` 新增 `收功恢复窗口` 文案；复制状态会显示剩余秒数和“收功后将继续 N 倍探索”。
- 目的：收功后等待玩家神识缓存刷新期间，优先接上自动探索，减少“收功 -> 缓存低神识 -> 又回冥想”的人工盯守问题。
- 该变更只在成功收功后的短窗口内恢复探索；如果页面明确不可探索或提示神识不足，仍走原有回冥想/等待逻辑。

`lingverse-explore-helper.user.js` v2.78.0 新增：

- `buildAfkWaitLikelyCause` 对 `post-meditation-ready` 的重复 `startAutoExplore` 失败增加专属归因：`收功后未能重启探索 · 自动探索启动失败 · ...`。
- `getAfkWaitingDiagnosisMeta` 对 `post-meditation-ready` 增加专属建议，提示检查自动探索入口、倍率控件和神识刷新。
- 目的：收功恢复窗口如果连续没接上探索，测试者复制状态即可区分“收功后卡住”和普通探索启动失败。
- 该变更只增强诊断和状态报告，不新增收功、探索、商人、护道、战斗、复活、用符、用丹或奇遇点击动作。

默认配置：

- `enabled: false`
- `meditationMinutes: 140`
- `minSpirit: 20`
- `exploreMultiplier: 1`
- `tickInterval: 30000`
- `stallTimeoutSeconds: 90`
- `resumeWindowSeconds: 60`
- `autoRevive: false`
- `reviveMaxPerRun: 0`
- `autoHireGuardian: false`
- `autoReloadOnUpdate: false`
- `useTalismans: false`
- `talismanMaxEncountersPerRun: 0`
- `useNirvanaPill: false`
- `nirvanaMaxPerRun: 0`
- `autoFight: false`
- `talismanMaxKinds: 5`
- `talismanQuantity: 1`
- `talismanFamilyOrder: ""`
- `nirvanaMinRarity: 4`
- `queueNirvanaPill: false`
- `adventureMode: "pause"`
- `adventureChoiceIndex: 1`
- `adventureChoiceMap: {}`

测试覆盖：

- 神识低于阈值 -> `startMeditation`
- 冥想达到配置时长 -> `stopMeditation`
- 神识可用且空闲 -> `startAutoExplore`
- 自动探索运行/恢复挂起且神识低于阈值 -> `startMeditation`
- 自动探索恢复挂起且页面提示神识不足/体力不足 -> `startMeditation`
- 自动探索运行/恢复挂起超过卡住秒数 -> `startMeditation`
- 恢复窗口：配置归一化为 0-3600 秒，快照包含 `resumeWindowSeconds`。
- 商人/遭遇激活 -> `wait`
- 自动迎战开启且遭遇激活 -> `handleEncounter`；同一个 encounter key 成功触发迎战后不会重复触发，新遭遇重新允许。
- 遭遇前自动护道：默认关闭；开启后按真实页面护道设置尝试一次，失败不回退直接迎战。
- 遭遇前自动护道如果游戏面板显示自动雇护道重试/处理中，会记录 `guardian-in-progress` 并等待结算，避免重复触发护道入口。
- 遭遇前自动护道只适用于 1 倍探索；`exploreMultiplier > 1` 时返回 `guardian-batch-explore-unavailable` 并等待测试者按富裕战斗链路或手动处理。
- 死亡状态优先级高于商人/遭遇/奇遇/陌生道友等阻塞，自动复活开启时先复活。
- 战斗符箓选择：跳过隐匿符/神行符/锁定物品，同类只选最高品质。
- 战斗符箓 family 顺序：支持 `ghost,fire,shield` 这类白名单顺序；留空保持按品质选择。
- 战斗符箓去重：同一个遭遇 key 只处理一次用符；没符会跳过并记住，下一次遭遇重新允许用符。
- 涅槃重生丹选择：只选 `bp_pill_rebirth_*` 或明确“五行通灵/涅槃重生丹”的 pill，默认史诗以上。
- 涅槃重生丹尝试：关闭、已有五行通灵、无匹配丹药、准备使用都会有结构化 reason，并出现在调试摘要。
- 探索中断分类：
  - `merchant` -> 自动商人处理器。
  - `encounter` -> 妖兽遭遇 handler 或等待。
  - `player_encounter` -> 默认暂停；开启 `autoDeclinePlayerEncounter` 后自动婉拒/离开。
  - `adventureId` -> 默认暂停；开启 `adventureMode: fixed` 后固定选择第 N 项；开启 `strategy` 后仅处理策略表命中的 ID。
  - `immortal_prison/prison_material` / `天道禁闭` -> hard-stop，暂停挂机。
  - `error` 且包含“神识不足” -> 回冥想。
- 自动探索状态判定：
  - v2.119.0 起，若页面暴露 `_autoExploreRunning` / `_autoResumeExplorePending`，挂机快照优先信任这些游戏内部标志；`#autoExploreToggle` 只在内部标志缺失时作为兜底。
  - 当 UI 开关仍勾选但内部运行和恢复挂起都为 false 时，标记 `autoExploreToggleStale`，下一轮按 `auto-explore-toggle-stale` 重新启动自动探索，并在状态报告显示 `探索: 开关失配`。这样可以处理“开关看着开着、实际探索停了”的长时间空等。
- 复活后恢复：
  - `autoRevive` 开启且死亡 -> `revive`
  - 复活后短时间内神识足够 -> `startAutoExplore`，沿用配置倍率。
  - 复活后神识不足 -> `startMeditation`。
- 互动后恢复：
  - 自动迎战、自动护道、奇遇/陌生道友处理后进入 `postInteractionResume`。
  - 恢复窗口内神识足够 -> `startAutoExplore`；神识不足 -> `startMeditation`。
- 收功后恢复：
  - `stopMeditation` 成功后进入 `postMeditationResume`。
  - 恢复窗口内即使缓存神识仍低，也优先 `startAutoExplore/post-meditation-ready`。
  - 如果 `canExplore=false` 但页面没有明确“神识不足/体力不足”原因，继续尝试恢复自动探索；明确神识不足时仍回冥想。
- 玩家信息刷新：
  - `buildSnapshot` 每轮优先只读刷新 `/api/player/info`，成功后同步 `_lastPlayerData`。
  - 接口失败时回退页面缓存，避免快照为空。
- 调试摘要：
  - `buildAfkDebugSummary` 去掉页面 URL 的 query/hash，脱敏常见 token/session/key 参数。
  - 历史压缩为最近 8 条决策/日志，长文本截断，保留关键阻塞、阶段/剩余时间、高风险开关、预设匹配状态、等待诊断归因、富裕资源预检、冥想执行尝试、商人购买尝试、陌生道友婉拒尝试、奇遇自动选择/关闭尝试、探索启动尝试、用丹尝试、用符尝试及符箓面板关闭状态、迎战尝试和护道尝试。
- 奇遇去重：
  - 策略/固定选择触发后，未推进的同一步同一选项不会被下一轮重复点击；报告显示 `本步已触发自动选择`。
  - 奇遇关闭或步骤变化会释放本地去重键，避免影响后续正常步骤。
- 可读状态报告：
  - hard-stop 状态会即时输出“硬停:”和“硬停建议:”，目前覆盖混天典狱和天道禁闭；这是只读提示，不触发任何自动跳过或资源动作。
  - v2.112.0 把自动商人配置独立输出为 `商人配置:`，直接显示开启状态、自动探索/挂机循环上下文、购买延迟、无商品离开和购买后卡窗离开；v2.118.0 追加“灵石不足离开”。这样测试者即使没有触发商人，也能从复制状态确认当前挂机是否会自动买最高价商品、买不起时是否会自动离开；`模式:` 继续负责预设匹配/漂移，`商人配置:` 负责当前事实。
  - v2.120.0 增加报告-only 的 `冥想溢出:`。当可见冥想条恢复神识加缓存神识已超过神识上限时，报告写出估算值和超出多少识，帮助测试者判断 140 分钟或自定义冥想时间是否太长；该行不触发收功、探索或任何资源动作，真正收功仍由既有 `stopMeditation` 决策负责。
  - v2.121.0 在溢出时追加报告-only 的 `冥想调时:`。它用当前恢复量和已冥想时长估算满识所需分钟数、本次超过满识点多久，并带上当前配置分钟数，帮助测试者把固定冥想时间调到更贴近账号恢复速度。
- 云游商人购买失败：
  - v2.118.0 仅把明确货币不足归类为 `insufficient-funds`，例如“灵石不足/余额不足/金币不够”。神识、体力、精力、灵力不足不属于商人货币不足，仍走探索资源不足或普通失败路径。
  - `leaveOnInsufficientFunds` 默认开启并随挂机预设、配置包导入导出保存；关闭后购买失败仍停留商人窗口，方便手动处理。
  - v2.122.0 起，自动商人购买和离开优先调用 `/api/game/merchant/buy` / `/api/game/merchant/leave`，只有 API 不可用时才回退页面函数。真实页面 `buyMerchantItem(index)` 会吞掉失败只弹 toast；API 优先后，脚本能读到 `code/message` 并正确识别灵石不足、普通购买失败或离开失败。
- DOM 可见性：
  - `isElementVisibleForAutomation` 统一检查 `hidden` class、`display:none`、`visibility:hidden/collapse`、`opacity:0`、`aria-hidden=true` 和零尺寸。
  - 冥想条、商人、遭遇、符箓弹窗、奇遇、陌生道友和奇遇选项过滤共用该判断，避免隐藏 DOM 残留导致挂机误等或隐藏按钮被当成可选项。

## 待继续研究

- 高阶“富裕模式”需要继续真实长跑验证涅槃重生丹使用后的 buff 状态和恢复 50 倍探索稳定性。
- 5 类战斗符箓的最佳收益顺序、每类用量和不同账号库存下的推荐 preset。
- 50 倍探索遇怪后，符箓使用、关闭符箓面板、迎战、复活、恢复 50 倍循环的真实长跑稳定性；v2.47.0 已能在状态报告中显示恢复窗口剩余秒数和下一步倾向，v2.48.0 可在神识不足时说明回冥想原因，v2.50.0 可显示迎战来源和失败建议，v2.51.0 可显示用符成功/失败和下一步建议，v2.52.0 可显示探索前用丹成功/失败和下一步建议，v2.53.0 可显示自动复活成功/失败和下一步建议，v2.54.0 可显示自动探索启动倍率、来源和失败建议，v2.55.0 可显示云游商人最高价购买和失败建议，v2.56.0 可显示冥想进入/收功执行来源和失败建议，v2.57.0 可显示是否仍匹配富裕 50 倍预设，v2.58.0 可显示用符后符箓面板是否关闭，v2.59.0 可在重复卡住时输出最可能自动化归因，v2.60.0 可避免同一遭遇重复触发迎战，v2.61.0 可在符箓面板未关闭时阻断自动迎战，v2.62.0 可在当前符箓面板关闭后恢复迎战判断，v2.63.0 可显示冥想收功触发原因，v2.64.0 可显示事件/复活恢复后未能重启探索的归因。
- 低境界 1 倍护道预设的真实长跑稳定性，尤其是状态报告“护道:”和“护道建议:”行里的失败消息、费用/最低攻击力建议，以及是否需要游戏内自动重试；v2.65.0 已能在重复等待时说明同一遭遇已尝试自动护道且不会重复扣费。
- v2.123.0 研究结论：真实页 `tryAutoHireProtectorForEncounter(options)` 会按游戏内护道设置调用 `/api/game/encounter-auto-hire` 并把失败写入 `_lastAutoHireProtectorFailure`；旧 helper 先点 `#encounterHireProtectorBtn`，按钮存在时会直接误记为已触发护道，无法确认是否真的雇到。现在自动护道优先调用页面函数/API 并读取失败原因，仅在两者都不可用时回退按钮。
- v2.124.0 研究结论：自动迎战也存在同类误报风险，旧 helper 在 `#encounterFightBtn` 存在时会先点按钮并直接标记 `fight-triggered`。现在改为先调用 `/api/game/combat-choice` 读取真实失败消息；API 不可用时才回退页面函数和按钮。
- v2.125.0 研究结论：收功是冥想-探索循环主轴，不能只因 `handleStopMeditate()` 返回就进入恢复探索。现在收功入口返回后会只读确认 `_lastPlayerData.isMeditating`、`/api/game/meditate/status` 和可见 `#meditationBar`；仍显示冥想中时记录 `stop-failed` 并清空收功恢复窗口。
- v2.126.0 研究结论：入定同样不能只因 `handleMeditate()` 返回就记为成功。现在开始冥想入口返回后会只读确认 `_lastPlayerData.isMeditating`、`/api/game/meditate/status` 和可见 `#meditationBar`；仍未显示冥想中时记录 `start-failed` 并清空决策 key 方便下一轮诊断。
- v2.127.0 研究结论：陌生道友自动婉拒也不能只因入口调用返回就恢复探索。现在婉拒/离开入口返回后会只读确认 PVP、邀约、会话、交易、战斗和响应选择弹窗是否仍可见；仍可见时记录 `decline-failed`，不打开事件恢复窗口。
- v2.128.0 研究结论：奇遇策略选择也不能只因选项按钮 click 返回就恢复探索。现在自动选择后会用本次传入的奇遇策略配置确认当前可见奇遇是否仍停在同一个 `adventureId + step + totalSteps + choiceIndex`；仍未推进时记录 `choice-failed` 和“奇遇选择入口已调用但页面仍停在同一步”，不打开事件恢复窗口。
- v2.128.0 Edge 读回证据：真实 Edge 游戏标签 `292345957` 刷新前仍是 helper/hook/initialized `2.124.0`；确认 AFK 关闭、自动探索未运行、商人/遭遇/奇遇/陌生道友均未激活且玩家冥想中后，只刷新游戏页。刷新后 helper/hook/initialized 均为 `2.128.0`，`confirmAdventureProgressed` hook 存在，控制台 error 为 0；extension/injected dataset 仍显示旧 `2.99.0`，属于页面 helper 已更新但扩展提示待下次重载统一。本次未点击收功、探索、商人购买、商人离开、护道、战斗、复活、用符、用丹、奇遇或道友按钮。
- v2.129.0 研究结论：已完成奇遇自动关闭也不能只因关闭按钮 click 返回就恢复探索。现在关闭后会只读确认 `#adventureOverlay` 是否仍可见；仍可见时记录 `close-failed` 和“奇遇关闭入口已调用但面板仍未关闭”，不打开事件恢复窗口。
- v2.130.0 研究结论：探索前涅槃重生丹也不能只因 `useItem` / 页面用丹入口返回成功就记为已使用。现在入口成功后会重新读取玩家信息并确认 `fiveRootBuffGrade` 或 `fiveRootBuffExpire` 等五行通灵状态；未确认时记录 `use-not-confirmed` 和“涅槃重生丹入口已调用但未检测到五行通灵效果”，不增加本轮用丹次数，并让状态报告/等待诊断显示“涅槃重生丹未确认生效”。
- v2.131.0 研究结论：真实 Edge 曾出现 `lingverseAutoMapInjectedVersion=2.99.0` 但 `window.LingVerseAutoMapVersion=null` 的半注入状态，旧 loader 会因为注入标记存在而跳过，导致页面无助手面板。现在 helper 会把加载/初始化版本写入 DOM dataset；loader 的重复注入保护必须同时看到注入标记和 helper/initialized 版本才跳过，否则重新追加 helper script。
- v2.132.0 研究结论：真实 Edge 接管时主面板默认 `display:none`，只能从侧栏“打开面板”进入，容易被误判为“未安装/未接管”。现在 helper 暴露 `LingVerseAutoMapTestHooks.showPanel()`、`hidePanel()` 和 `getPanelState()`，Agent 可以只读/显示面板并确认 helper、初始化、扩展 dataset、AFK 和商人开关，不需要点击收功、探索、购买、护道、战斗、复活、用符、用丹、奇遇或陌生道友按钮。
- v2.133.0 研究结论：多人测试时，卡住现场经常发生在测试者不在屏幕前，单靠手动“复制摘要”会错过。现在 AFK 每轮 tick 在 `waitDiagnosis.active` 时自动把最近一次脱敏摘要和可读状态报告保存到 `localStorage` 的 `lingverse_afk_last_issue_snapshot_v1`，面板可“复制最近卡点”，Agent 可用 `LingVerseAutoMapTestHooks.getLastAfkIssueSnapshot()` 读回。保存仍复用现有 URL query/hash 清理和敏感参数脱敏，不新增收功、探索、商人、护道、战斗、复活、用符、用丹、奇遇或道友动作。
- v2.134.0 研究结论：长跑测试可能连续遇到“奇遇等待、护道失败、事件恢复失败”等多个不同卡点，单条最近卡点会被覆盖。现在保存最近卡点时同步维护 `lingverse_afk_issue_history_v1`，保留最近 5 条不同卡点，并按 `action/reason/firstAt/likelyCause/message` 去重，避免同一次等待每轮 tick 都刷屏。面板可复制整段卡点历史，Agent 可用 `LingVerseAutoMapTestHooks.getAfkIssueHistory()` 读回。
- 护道与批量探索的边界要继续观察：v2.97.0 已在 AFK 层跳过“自动护道 + 批量探索”的无效组合，并把建议导向 1 倍护道或富裕 50 倍战斗链路。
- 哪些奇遇/事件需要自动接受、拒绝或等待用户确认。
- 继续收集真实奇遇链样本；v2.46.0 可读状态已能回传 `adventureId`、步骤和选项文本，v2.66.0 可在自动选择重复未前进时显示选中的选项，v2.69.0 可在首次复制状态时显示奇遇自动选择/关闭尝试来源和失败建议，后续仍需记录最终奖励并沉淀成可分享策略。
- 陌生道友邂逅弹窗结构仍需真实长跑观察；v2.67.0 已能在自动婉拒重复未关闭时给出专属诊断，v2.68.0 已能在首次复制状态时显示婉拒尝试来源和失败建议。
- 为摘要增加导入式问题回放视图。
