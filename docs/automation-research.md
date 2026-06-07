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

死亡复活：

- `handleRevive()` 调用 `POST /api/game/revive`。
- 复活会花灵石，脚本默认关闭自动复活。

## 当前脚本实现

`lingverse-explore-helper.user.js` v2.8.0 新增：

- `CONFIG.afkLoop`
- `decideAfkNextAction(state, config, now)`
- `AfkLoopManager`
- 面板里的“自动挂机循环”配置区

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

测试覆盖：

- 神识低于阈值 -> `startMeditation`
- 冥想达到配置时长 -> `stopMeditation`
- 神识可用且空闲 -> `startAutoExplore`
- 商人/遭遇激活 -> `wait`

## 待继续研究

- 高阶“富裕模式”如何安全选择涅槃重生丹，避免吃错丹药。
- 5 类战斗符箓的排序、每类用量、缺货跳过策略。
- 50 倍探索遇怪后，符箓使用、关闭符箓面板、迎战、复活、恢复 50 倍循环的完整状态机。
- 哪些奇遇/事件需要自动接受、拒绝或等待用户确认。
