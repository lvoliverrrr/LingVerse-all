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
- 当前脚本不解析奇遇含义，只提供“默认暂停”和“固定点击第 N 个选项”两种策略。

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
- 处理成功后进入 60 秒恢复窗口，让挂机循环按神识状态继续探索或回冥想。

`lingverse-explore-helper.user.js` v2.12.0 新增：

- `adventureMode`：奇遇链处理模式，默认 `pause`。
- `adventureChoiceIndex`：`fixed` 模式下点击界面第几个奇遇选项，从 1 开始。
- `decideAfkNextAction` 只有在 `adventureMode: fixed` 时才返回 `handleAdventure`。
- `AfkLoopManager.handleAdventure()` 优先点击 `.adventure-choice-btn`，没有选项但有 `.adventure-close-btn` 时关闭已完成奇遇。
- 固定序号超出当前选项数量时等待手动处理，避免自动改点其他分支。

默认配置：

- `enabled: false`
- `meditationMinutes: 140`
- `minSpirit: 20`
- `exploreMultiplier: 1`
- `tickInterval: 30000`
- `stallTimeoutSeconds: 90`
- `autoRevive: false`
- `useTalismans: false`
- `useNirvanaPill: false`
- `autoFight: false`
- `talismanMaxKinds: 5`
- `talismanQuantity: 1`
- `nirvanaMinRarity: 4`
- `queueNirvanaPill: false`
- `adventureMode: "pause"`
- `adventureChoiceIndex: 1`

测试覆盖：

- 神识低于阈值 -> `startMeditation`
- 冥想达到配置时长 -> `stopMeditation`
- 神识可用且空闲 -> `startAutoExplore`
- 商人/遭遇激活 -> `wait`
- 自动迎战开启且遭遇激活 -> `handleEncounter`
- 战斗符箓选择：跳过隐匿符/神行符/锁定物品，同类只选最高品质。
- 涅槃重生丹选择：只选 `bp_pill_rebirth_*` 或明确“五行通灵/涅槃重生丹”的 pill，默认史诗以上。
- 探索中断分类：
  - `merchant` -> 自动商人处理器。
  - `encounter` -> 妖兽遭遇 handler 或等待。
  - `player_encounter` -> 默认暂停；开启 `autoDeclinePlayerEncounter` 后自动婉拒/离开。
  - `adventureId` -> 默认暂停；开启 `adventureMode: fixed` 后固定选择第 N 项。
  - `immortal_prison/prison_material` -> hard-stop，暂停挂机。
  - `error` 且包含“神识不足” -> 回冥想。
- 复活后恢复：
  - `autoRevive` 开启且死亡 -> `revive`
  - 复活后短时间内神识足够 -> `startAutoExplore`，沿用配置倍率。
  - 复活后神识不足 -> `startMeditation`。

## 待继续研究

- 高阶“富裕模式”如何安全选择涅槃重生丹，避免吃错丹药。
- 5 类战斗符箓的排序、每类用量、缺货跳过策略。
- 50 倍探索遇怪后，符箓使用、关闭符箓面板、迎战、复活、恢复 50 倍循环的完整状态机。
- 哪些奇遇/事件需要自动接受、拒绝或等待用户确认。
- 继续收集真实奇遇链样本，后续做 `adventureId -> choiceIndex` 的 per-event 策略表；当前全局固定第 N 项只适合测试者已知自己想怎么选的场景。
