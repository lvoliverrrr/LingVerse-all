# 自动挂机实现计划

更新时间：2026-06-08

## 原则

- 外部脚本优先做原型，不直接改游戏本体。
- 默认低风险：不自动复活、不自动吃丹、不自动用符箓、不自动点未知事件。
- 资源消耗动作必须有独立配置开关。
- 优先调用游戏页面原生函数，让原本的 UI、日志、恢复逻辑继续生效。
- 每个状态机分支先有纯决策测试，再接 DOM/API 执行器。

## 第一阶段：基础挂机循环

状态：

- `idle`
- `meditating`
- `autoExploring`
- `blockedByMerchant`
- `blockedByEncounter`
- `dead`

决策：

- 配置未启用 -> 等待。
- 商人激活 -> 等待，由 `MerchantAutoBuyer` 处理。
- 遭遇/战斗激活 -> 等待，避免和原游戏战斗流程抢控制权。
- 死亡 -> 默认等待；只有开启 `autoRevive` 才尝试复活。
- 正在冥想且神识满 -> 收功。
- 正在冥想且达到 `meditationMinutes` -> 收功。
- 非冥想且神识低于 `minSpirit` 或单次探索消耗 -> 冥想。
- 非冥想且神识足够 -> 按 `exploreMultiplier` 启动自动探索。
- 自动探索长时间无进展 -> 停止探索并回冥想。

已实现于 `lingverse-explore-helper.user.js` v2.8.0。

## 第二阶段：事件处理扩展

目标：

- 收集自动探索中会让循环挂起的事件状态。
- 将每类事件做成独立 handler。

初始分类：

- 云游商人：已实现，买最高价商品。
- 妖兽遭遇：基础模式等待；富裕模式自动战斗。
- 奇遇/道友邂逅：先只记录，不自动提交。
- 典狱/特殊区域：停止循环并提示。
- 神识不足/不可探索：回冥想或等待，按 `exploreDisabledReason` 判断。

## 第三阶段：富裕战斗模式

前置配置：

- `exploreMultiplier: 50`
- `useNirvanaPill: true`
- `nirvanaMinRarity: 4`
- `queueNirvanaPill: false`
- `autoFight: true`
- `useTalismans: true`
- `talismanMaxKinds: 5`
- `talismanQuantity: 1`
- `autoRevive: true`

设计状态机：

1. 探索前检查是否有可用史诗五行通灵类涅槃重生丹。
2. 有则使用，失败或没有则跳过。
3. 设置 50 倍探索并启动自动探索。
4. 遇妖后打开符箓面板。
5. 选择最多 5 类战斗符箓，每类默认 1 张，缺货跳过。
6. 调用 `/api/game/use-item` 使用对应战斗符，保持每种之间节流。
7. 关闭符箓面板。
8. 点击迎战。
9. 若死亡且 `autoRevive` 开启，调用 `handleRevive()`。
10. 复活后刷新玩家状态，神识足够则继续 50 倍探索，不足则冥想。

v2.9.0 已完成：

- 第 1 步到第 8 步的 opt-in 骨架。
- 不再把回血丹 `pill_nirvana_*` 当成涅槃重生丹；只选 `bp_pill_rebirth_*` 或明确五行通灵/涅槃重生命名的 pill。
- 符箓按 family 去重，优先最高品质，最多 5 种。
- 遭遇默认仍等待，只有 `autoFight` 开启才进入 handler。

v2.10.0 已完成：

- 复活后恢复窗口：如果神识仍足够，按配置倍率继续自动探索；如果神识不足，转入冥想。
- 探索中断分类函数，明确哪些事件能自动处理、哪些事件默认暂停。
- 页面 overlay 检测：
  - 奇遇链 `#adventureOverlay`
  - 陌生道友邂逅 `#pvpEncounterModal` / `#encounterInviteModal` / `#encounterSessionModal` 等
  - 混天典狱 `currentArea` 前缀

v2.11.0 已完成：

- 新增 `autoDeclinePlayerEncounter`，默认关闭。
- 开启后自动婉拒陌生道友邀请、关闭邂逅卡或离开已打开邂逅会话。
- 处理成功后进入恢复窗口，继续走“神识够就探索，不够就冥想”的主循环。

v2.12.0 已完成：

- 新增 `adventureMode`，默认 `pause`，遇到奇遇链仍暂停等待用户处理。
- 新增 `adventureChoiceIndex`，当 `adventureMode: fixed` 时按界面顺序点击第 N 个奇遇选项。
- 奇遇完成后如果页面只剩“结束奇遇/关闭/完成”按钮，脚本会关闭面板并进入恢复窗口。
- 固定选择序号超出当前可选项数量时只提示并等待手动处理，不自动改点其他选项。

v2.13.0 已完成：

- 新增 `adventureMode: strategy`，按 `adventureId -> choiceIndex` 策略表自动选择。
- 新增 `adventureChoiceMap`，支持 JSON 对象和 `456=2` / `789:1` 多行文本。
- 未命中策略表的奇遇仍暂停等待用户处理，不回退到全局固定选择。
- 由于原游戏 DOM 不暴露 `adventureId`，脚本会包装 `showAdventureStep(step)`，只记录最近奇遇 step，不改变原 UI 流程。

v2.14.0 已完成：

- 新增“复制快照”按钮，一键导出当前挂机调试 JSON。
- 快照包含页面、下一步决策、神识/冥想状态、事件阻塞、自动探索状态、奇遇 ID/选项和关键配置。
- 未知奇遇或挂机停住时，测试者可以直接把快照发回，减少复现成本。

v2.15.0 已完成：

- 快照新增 `history.decisionTail`，保留最近 20 次挂机决策。
- 快照新增 `history.logTail`，保留最近 30 条脚本日志。
- Logger 现在缓存最近日志，并对面板日志内容做 HTML 转义。

v2.16.0 已完成：

- 新增“套用稳妥1倍”和“套用富裕50倍”两个挂机预设按钮。
- 稳妥预设：1 倍探索，关闭自动迎战、自动复活、自动用符、自动用丹、自动婉拒陌生道友。
- 富裕预设：50 倍探索，开启自动迎战、自动复活、自动用符、自动用丹、自动婉拒陌生道友。
- 预设只改配置并保存，不会自动启动挂机；已有奇遇策略表会保留。

v2.17.0 已完成：

- 新增战斗符箓 family 顺序/白名单输入。
- 留空时保持原逻辑：按 family 去重后选最高品质，最多 5 类。
- 填写如 `ghost,fire,shield` 时，只按该顺序选择存在且可用的 family，缺货跳过。
- 稳妥/富裕预设会保留当前 family 顺序，不会替测试者清空偏好。

v2.18.0 已完成：

- 自动探索运行或恢复挂起时，若当前神识低于 `minSpirit` 或低于单次探索消耗，直接停探索并回冥想。
- 自动探索恢复挂起时，若页面 `canExplore=false` 且原因包含“神识/体力”，优先回冥想，不再继续等待 pending 状态。
- 商人、遭遇、奇遇、陌生道友和死亡等显式阻塞仍保持更高优先级，避免在事件未处理时抢操作。

v2.19.0 已完成：

- 新增 `resumeWindowSeconds`，控制复活、奇遇处理、陌生道友处理后的主动恢复窗口。
- 默认 60 秒，支持 0-3600 秒；设置为 0 时关闭短恢复窗口。
- 稳妥/富裕预设会保留测试者已设置的恢复窗口，避免慢网络账号被重置。
- 调试快照会带上 `resumeWindowSeconds`，方便测试者反馈“处理完事件后为什么没继续”的问题。

v2.20.0 已完成：

- 新增 encounter key，用怪物 ID、境界 stage、等级 level 识别当前遭遇；缺少 ID 时退回到遭遇面板文本。
- 自动战斗用符增加同遭遇去重：同一个 encounter key 已成功用过符时，后续 tick 只迎战，不重复消耗符箓。
- 当快照不再处于遭遇/战斗状态时清空上一次用符 key，保证下一次新遭遇仍可按配置用符。
- 真实页面只读确认：隐藏的遭遇面板仍可能保留旧怪物文本和 `_currentEncounterMonsterId`，所以脚本只在遭遇/战斗 active 时生成 key。

v2.21.0 已完成：

- 新增 `resolveCombatTalismanAttempt`，统一处理“是否还要尝试用符”和“是否标记本遭遇已处理”。
- 同一遭遇若背包没有可用战斗符，也会标记为已处理，后续 tick 不再重复读取背包。
- 同一遭遇完成一轮用符尝试后，无论最终成功几种符，都标记为已处理，避免网络/物品失败导致反复尝试。
- 读取背包失败不会标记已处理，保留下一次 tick 重试机会。

v2.22.0 已完成：

- 新增 `autoHireGuardian`，AFK 遭遇处理可在自动迎战前按游戏当前自动护道设置尝试雇护道，默认关闭。
- 新增 `getCurrentGuardianConfig`，优先读取页面 `getAutoHireConfig()`，避免脚本面板缓存和游戏当前设置不一致。
- 新增 `resolveEncounterGuardianAttempt`，同一个 encounter key 只尝试一次自动护道，成功或失败后都不会在后续 tick 重复发起雇佣请求。
- 自动护道未成功时不回退为直接迎战，停在遭遇面板等待测试者手动处理，降低低境界账号误送死风险。
- 调试快照增加 `autoHireGuardian` 和当前护道配置，便于测试者反馈低境界挂机停顿原因。

v2.23.0 已完成：

- 调整 AFK 决策优先级：死亡状态现在高于奇遇、陌生道友、商人、遭遇和战斗残留面板。
- `autoRevive` 开启且检测到死亡时会直接走 `revive`，避免战死后仍尝试处理旧遭遇或继续迎战。
- `autoRevive` 未开启时死亡也会返回 `dead` 等待原因，方便快照和日志定位真实卡点。
- 真实页面只读确认：`playerDead` / `_lastPlayerData.isDead` 是死亡来源，`handleRevive()` 调用 `/api/game/revive` 并清理死亡遮罩。

v2.24.0 已完成：

- 新增 `isExploreStalledState`，把自动探索运行态和恢复挂起态统一纳入卡住判定。
- `buildSnapshot` 不再因为 `_autoResumeExplorePending=true` 且 `_autoExploreRunning=false` 就每个 tick 重置进度时间。
- 真实页面只读确认：`_tryResumeAutoExploreAfterMerchant()` 会在 `_autoResumeExplorePending` 时延迟 1.5 秒重启探索；若 pending 残留，脚本现在能按卡住秒数回冥想。

v2.25.0 已完成：

- 新增 `buildAfkDebugSummary(debugSnapshot)`，从完整快照生成 `lingverse-afk-debug-summary/v1` 脱敏摘要。
- “复制摘要”按钮现在复制摘要 JSON：URL 会去掉 query/hash，常见 token/session/key 参数会脱敏，长日志和长选项会截断。
- 摘要保留神识、阻塞状态、下一步决策、奇遇选项、最近 8 条决策/日志和富裕模式高风险开关，方便测试者安全反馈卡点。

v2.26.0 已完成：

- 新增 `resolveNirvanaRebirthPillAttempt(player, items, config, now)`，把富裕模式探索前用丹决策抽成可测试纯函数。
- 用丹尝试会明确返回 `disabled`、`active-five-root-buff`、`no-matching-pill` 或 `pill-ready`，并记录最低品质、当前五行通灵状态和选中的丹药。
- “复制摘要”会带上最近一次涅槃重生丹尝试结果，测试者反馈时能直接看出是没开、已有 buff、没找到史诗丹，还是准备使用。
- `startAutoExplore` 现在使用本轮归一化后的挂机配置调用用丹逻辑，避免探索前用丹读取到旧的全局配置。

v2.27.0 已完成：

- `decideAfkNextAction` 新增 `postInteractionResume` 分支，区别于复活恢复；事件/战斗后神识足够返回 `post-interaction-ready`，神识不足返回 `post-interaction-low-spirit`。
- `buildSnapshot` 分别输出 `postReviveResume` 和 `postInteractionResume`，调试快照/摘要可判断到底是复活后恢复，还是战斗/奇遇/护道等互动后恢复。
- 自动迎战成功触发后会设置 `postInteractionResumeUntil`，并按 `resumeWindowSeconds` 安排下一次检查，帮助富裕 50 倍模式在战斗结算后继续探索循环。

风险：

- 50 倍遇怪失败会损失预扣神识。
- 复活和丹药都消耗资源。
- 自动护道会消耗灵石或护道资源，必须由测试者显式开启，且以游戏当前护道设置为准。
- 符箓 family 顺序仍需要玩家按账号库存和实战收益调优。
- 当前账号未读到 `bp_pill_rebirth_*`，所以涅槃重生丹分支只做了选择/尝试决策测试，未做真实消耗验证。
- 奇遇链涉及剧情分支和奖励选择，固定选择必须由测试者显式开启，默认不能自动点。

## 第四阶段：脚本体验打磨

- 面板里增加“当前决策/上次动作/下次检查时间”。
- 导出调试快照，方便其他测试者反馈。
- 为每个高风险动作显示独立开关状态。
- 给测试者一个建议配置：
  - 低境界：1 倍探索、护道交给游戏设置、不开复活/丹/符。
  - 富裕：50 倍探索、开复活/丹/符，但先小号测试。

## 测试策略

自动测试：

- `node --test tests/*.test.js`
- `node --check lingverse-extension-loader.js`
- `for f in *.user.js; do node --check "$f"; done`
- `git diff --check`

v2.9.0 新增自动测试：

- `selectCombatTalismans` 最多选择 5 种、跳过隐匿/神行/锁定符、同类取最高品质。
- `selectNirvanaRebirthPill` 只选择五行通灵类涅槃重生丹，默认史诗以上。
- `decideAfkNextAction` 只有 `autoFight` 开启时才把遭遇交给自动 handler。

v2.10.0 新增自动测试：

- `classifyExploreInterruption` 覆盖商人、陌生道友、奇遇链、混天典狱、神识不足。
- `decideAfkNextAction` 覆盖死亡自动复活、复活后继续探索、复活后低神识回冥想。

v2.11.0 新增自动测试：

- `classifyExploreInterruption` 在 `autoDeclinePlayerEncounter` 开启时把 `player_encounter` 归类为 `auto-decline`。
- `decideAfkNextAction` 只有开启 `autoDeclinePlayerEncounter` 才自动处理陌生道友邂逅。

v2.12.0 新增自动测试：

- `classifyExploreInterruption` 在 `adventureMode: pause` 时保持暂停，在 `fixed` 时归类为 `auto-choice`。
- `decideAfkNextAction` 只有开启固定奇遇选择时才把奇遇交给 `handleAdventure`。

v2.13.0 新增自动测试：

- `normalizeAfkLoopConfig` 可解析 JSON 和多行文本格式的 `adventureChoiceMap`。
- `resolveAdventureChoiceIndex` 只对策略表命中的 `adventureId` 返回选择序号。
- `classifyExploreInterruption` / `decideAfkNextAction` 在策略模式下只自动处理已映射奇遇，未知奇遇保持等待。

v2.14.0 新增自动测试：

- `buildAfkDebugSnapshot` 输出稳定 schema，覆盖 blockers、adventure、decision、player 和 config 字段。

v2.15.0 新增自动测试：

- `buildAfkDebugSnapshot` 会截取最近 20 条决策和最近 30 条日志，避免复制过大。

v2.16.0 新增自动测试：

- `applyAfkPreset` 可生成稳妥/富裕两套配置，且不会强制启用挂机或清空奇遇策略。

v2.17.0 新增自动测试：

- `selectCombatTalismans` 可按配置的 family 顺序/白名单选择战斗符箓。
- `normalizeAfkLoopConfig` 会清理 family 顺序输入中的重复项、空白和中英文分隔符。
- `applyAfkPreset` 保留已配置的 family 顺序。

v2.18.0 新增自动测试：

- `decideAfkNextAction` 在自动探索运行或恢复挂起且神识低于阈值时返回 `startMeditation`。
- `decideAfkNextAction` 在恢复挂起且页面提示神识不足/体力不足时返回 `startMeditation`，不再无限等待 pending。

v2.19.0 新增自动测试：

- `normalizeAfkLoopConfig` 会把恢复窗口限制在 0-3600 秒。
- `getResumeWindowMs` 会把恢复窗口转换成毫秒，并保持同样的边界。
- `applyAfkPreset` 保留已配置的恢复窗口。
- `buildAfkDebugSnapshot` 输出恢复窗口配置。

v2.20.0 新增自动测试：

- `buildEncounterKey` 只在遭遇/战斗 active 时生成稳定 key，避免隐藏旧面板污染新判断。
- `shouldUseCombatTalismansForEncounter` 对同一个 key 返回跳过，对新 key 允许用符。

v2.21.0 新增自动测试：

- `resolveCombatTalismanAttempt` 在同一遭遇无可用符时返回 `markEncounterKey`，让执行器后续跳过重复背包扫描。
- `resolveCombatTalismanAttempt` 在选到符但尚未完成尝试时不提前标记，完成一轮尝试后才标记。
- 已标记的同一遭遇不会再次尝试用符，新遭遇仍可重新尝试。

v2.22.0 新增自动测试：

- `normalizeAfkLoopConfig` 保留 `autoHireGuardian` 显式开关，默认仍为关闭。
- `resolveEncounterGuardianAttempt` 会在自动护道关闭、游戏护道关闭、已尝试过同一遭遇时返回不同 reason。
- `resolveEncounterGuardianAttempt` 只在尝试完成后返回 `markEncounterKey`，避免同一遭遇重复雇佣。
- `getCurrentGuardianConfig` 优先读取真实页面 `getAutoHireConfig()` 的模式、费用和优先级。

v2.23.0 新增自动测试：

- `decideAfkNextAction` 在 `isDead=true` 且残留 `encounterActive/combatActive` 时优先返回 `revive`。
- `decideAfkNextAction` 在 `isDead=true` 且自动复活未开启时优先返回 `dead` 等待，而不是商人/奇遇/陌生道友等旧阻塞。

v2.24.0 新增自动测试：

- `isExploreStalledState` 对 `autoExploreRunning=true` 和 `autoExplorePending=true` 都会按 `stallTimeoutSeconds` 判定卡住。
- 自动探索未运行且无恢复挂起时，即使进度时间很旧也不会判定卡住。

v2.25.0 新增自动测试：

- `buildAfkDebugSummary` 会去掉页面 URL 的 query/hash，脱敏常见 token/session/key 参数。
- `buildAfkDebugSummary` 会压缩历史为最近 8 条决策/日志，并截断长日志和长奇遇选项。
- 摘要保留富裕模式高风险开关，便于判断测试者是否开启迎战、护道、复活、用符、用丹等动作。

v2.26.0 新增自动测试：

- `resolveNirvanaRebirthPillAttempt` 覆盖用丹关闭、已有五行通灵且不排队、允许排队、没有满足品质丹药四种路径。
- `buildAfkDebugSnapshot` / `buildAfkDebugSummary` 会输出涅槃重生丹尝试结果，摘要中丹药名称也会脱敏。

v2.27.0 新增自动测试：

- `decideAfkNextAction` 覆盖 `postInteractionResume=true` 时神识足够继续探索、神识不足回冥想。
- `buildAfkDebugSnapshot` / `buildAfkDebugSummary` 会输出 `postInteractionResume`，方便定位战斗/事件后为什么没有继续。

浏览器验证：

- 使用 Agent Browser CLI 读真实 Edge 标签，不用论坛/聊天资料。
- 先只读状态和函数，不主动消耗资源。
- 资源动作只在用户明确试用或脚本配置开启后发生。

## 下一步建议

1. 用户实测 v2.27.0 低境界 1 倍模式：开启自动迎战和遭遇前自动护道，但不开复活/丹/符。
2. 继续用真实挂机日志收集“自动探索停住”的事件原因，尤其记录护道失败 message。
3. 富裕 50 倍模式继续小号测试：用符、复活、用丹都保持 opt-in，观察战斗结算后恢复窗口是否够用。
4. 用真实奇遇链继续记录每个 adventureId 的选项、奖励和后续步骤。
5. 为摘要补“可导入的问题回放视图”。
