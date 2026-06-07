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
- 保留事件阻塞优先级：商人、遭遇、奇遇、陌生道友、混天典狱和死亡仍先处理或等待。
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

- `autoHireGuardian`：AFK 遭遇处理中的独立开关，默认关闭；开启后必须同时开启自动迎战才会进入遭遇 handler。
- `getCurrentGuardianConfig()`：优先从真实页面 `getAutoHireConfig()` 读取当前自动护道设置，页面函数不可用时回退脚本配置。
- `resolveEncounterGuardianAttempt(lastKey, snapshot, afkConfig, guardianConfig, options)`：按 encounter key 控制同一遭遇只尝试一次自动护道。
- 执行顺序：可选用符 -> 可选自动护道 -> 未开自动护道时才直接迎战。
- 自动护道成功后刷新状态并给恢复窗口；失败后不直接迎战，等待测试者手动处理。

`lingverse-explore-helper.user.js` v2.23.0 新增：

- `decideAfkNextAction` 将死亡判断提前到奇遇、陌生道友、商人、遭遇和战斗残留面板之前。
- 当 `autoRevive=true` 且 `isDead=true` 时，下一步固定为 `revive`。
- 当 `autoRevive=false` 且 `isDead=true` 时，下一步固定为 `wait/dead`，方便测试者从快照判断是复活开关未开。
- 目的：避免战死后页面残留旧遭遇或战斗 active 状态，导致脚本继续走 `handleEncounter` 而不是复活。

默认配置：

- `enabled: false`
- `meditationMinutes: 140`
- `minSpirit: 20`
- `exploreMultiplier: 1`
- `tickInterval: 30000`
- `stallTimeoutSeconds: 90`
- `resumeWindowSeconds: 60`
- `autoRevive: false`
- `autoHireGuardian: false`
- `useTalismans: false`
- `useNirvanaPill: false`
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
- 恢复窗口：配置归一化为 0-3600 秒，快照包含 `resumeWindowSeconds`。
- 商人/遭遇激活 -> `wait`
- 自动迎战开启且遭遇激活 -> `handleEncounter`
- 遭遇前自动护道：默认关闭；开启后按真实页面护道设置尝试一次，失败不回退直接迎战。
- 死亡状态优先级高于商人/遭遇/奇遇/陌生道友等阻塞，自动复活开启时先复活。
- 战斗符箓选择：跳过隐匿符/神行符/锁定物品，同类只选最高品质。
- 战斗符箓 family 顺序：支持 `ghost,fire,shield` 这类白名单顺序；留空保持按品质选择。
- 战斗符箓去重：同一个遭遇 key 只处理一次用符；没符会跳过并记住，下一次遭遇重新允许用符。
- 涅槃重生丹选择：只选 `bp_pill_rebirth_*` 或明确“五行通灵/涅槃重生丹”的 pill，默认史诗以上。
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

## 待继续研究

- 高阶“富裕模式”如何安全选择涅槃重生丹，避免吃错丹药。
- 5 类战斗符箓的最佳收益顺序、每类用量和不同账号库存下的推荐 preset。
- 50 倍探索遇怪后，符箓使用、关闭符箓面板、迎战、复活、恢复 50 倍循环的真实长跑稳定性。
- 低境界 1 倍探索开启自动护道后的真实长跑稳定性，尤其是护道失败 message 和是否需要游戏内自动重试。
- 哪些奇遇/事件需要自动接受、拒绝或等待用户确认。
- 继续收集真实奇遇链样本，把 `adventureId`、每步选项、最终奖励记录成可分享策略。
- 为快照增加可选脱敏摘要和导入式问题回放视图。
