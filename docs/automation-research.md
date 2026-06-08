# 灵界挂机自动化研究记录

更新时间：2026-06-08

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
- `MerchantAutoBuyer.lastAttempt` 会记录读商人失败、无可买商品、准备购买、页面函数/API 触发购买和购买失败。
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
  - `immortal_prison/prison_material` -> hard-stop，暂停挂机。
  - `error` 且包含“神识不足” -> 回冥想。
- 复活后恢复：
  - `autoRevive` 开启且死亡 -> `revive`
  - 复活后短时间内神识足够 -> `startAutoExplore`，沿用配置倍率。
  - 复活后神识不足 -> `startMeditation`。
- 互动后恢复：
  - 自动迎战、自动护道、奇遇/陌生道友处理后进入 `postInteractionResume`。
  - 恢复窗口内神识足够 -> `startAutoExplore`；神识不足 -> `startMeditation`。
- 调试摘要：
  - `buildAfkDebugSummary` 去掉页面 URL 的 query/hash，脱敏常见 token/session/key 参数。
  - 历史压缩为最近 8 条决策/日志，长文本截断，保留关键阻塞、阶段/剩余时间、高风险开关、预设匹配状态、等待诊断归因、富裕资源预检、冥想执行尝试、商人购买尝试、探索启动尝试、用丹尝试、用符尝试及符箓面板关闭状态、迎战尝试和护道尝试。

## 待继续研究

- 高阶“富裕模式”需要继续真实长跑验证涅槃重生丹使用后的 buff 状态和恢复 50 倍探索稳定性。
- 5 类战斗符箓的最佳收益顺序、每类用量和不同账号库存下的推荐 preset。
- 50 倍探索遇怪后，符箓使用、关闭符箓面板、迎战、复活、恢复 50 倍循环的真实长跑稳定性；v2.47.0 已能在状态报告中显示恢复窗口剩余秒数和下一步倾向，v2.48.0 可在神识不足时说明回冥想原因，v2.50.0 可显示迎战来源和失败建议，v2.51.0 可显示用符成功/失败和下一步建议，v2.52.0 可显示探索前用丹成功/失败和下一步建议，v2.53.0 可显示自动复活成功/失败和下一步建议，v2.54.0 可显示自动探索启动倍率、来源和失败建议，v2.55.0 可显示云游商人最高价购买和失败建议，v2.56.0 可显示冥想进入/收功执行来源和失败建议，v2.57.0 可显示是否仍匹配富裕 50 倍预设，v2.58.0 可显示用符后符箓面板是否关闭，v2.59.0 可在重复卡住时输出最可能自动化归因，v2.60.0 可避免同一遭遇重复触发迎战，v2.61.0 可在符箓面板未关闭时阻断自动迎战，v2.62.0 可在当前符箓面板关闭后恢复迎战判断，v2.63.0 可显示冥想收功触发原因，v2.64.0 可显示事件/复活恢复后未能重启探索的归因。
- 低境界 1 倍护道预设的真实长跑稳定性，尤其是状态报告“护道:”和“护道建议:”行里的失败消息、费用/最低攻击力建议，以及是否需要游戏内自动重试；v2.65.0 已能在重复等待时说明同一遭遇已尝试自动护道且不会重复扣费。
- 哪些奇遇/事件需要自动接受、拒绝或等待用户确认。
- 继续收集真实奇遇链样本；v2.46.0 可读状态已能回传 `adventureId`、步骤和选项文本，v2.66.0 可在自动选择重复未前进时显示选中的选项，后续仍需记录最终奖励并沉淀成可分享策略。
- 陌生道友邂逅弹窗结构仍需真实长跑观察；v2.67.0 已能在自动婉拒重复未关闭时给出专属诊断。
- 为摘要增加导入式问题回放视图。
