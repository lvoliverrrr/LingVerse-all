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
- 遭遇默认仍等待；v2.31.0 起 `autoHireGuardian` 或 `autoFight` 任一开启即可进入 handler。

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

v2.28.0 已完成：

- `buildAfkDebugSummary` 的 `adventure` 增加 `strategyHints`，为每个当前奇遇选项生成 `{ choiceIndex, choiceText, mapLine }`。
- `mapLine` 形如 `999=2`，可直接复制到“奇遇策略表”，帮助测试者把未知奇遇反馈快速沉淀为 `adventureId -> choiceIndex` 固定策略。
- `choiceText` 继续走摘要脱敏/截断逻辑，避免把过长或带 token-like 文本原样发出。

v2.29.0 已完成：

- 新增 `normalizeCombatTalismanAttempt` / `summarizeCombatTalismanAttempt`，把战斗用符尝试写入调试快照和脱敏摘要。
- 摘要中的 `automation.talismans` 会输出 `disabled`、`no-encounter`、`already-handled`、`inventory-read-failed`、`no-usable-talismans`、`talismans-selected`、`completed` 等路径，便于定位富裕 50 倍遇怪链路。
- 用符摘要会带上选中符箓的脱敏名称、templateId、family、品质、数量，以及 `usedKinds` / `failedKinds` 和失败消息摘要。
- `AfkLoopManager` 记录 `lastTalismanAttempt`，复制摘要时能看到最近一次运行时用符决策，而不需要测试者翻日志。

v2.30.0 已完成：

- 新增 `normalizeGuardianAttempt` / `summarizeGuardianAttempt`，把低境界 1 倍模式最关键的自动护道尝试写入调试快照和脱敏摘要。
- 摘要中的 `automation.guardian` 会输出 `afk-guardian-disabled`、`guardian-config-disabled`、`no-encounter`、`guardian-already-attempted`、`guardian-ready`、`hire-triggered`、`hire-failed` 等路径。
- 护道摘要会带上当前游戏护道设置（模式、最高费用、最低攻击力、优先级、威胁阈值）、是否触发雇佣和失败消息摘要。
- `AfkLoopManager` 记录 `lastGuardianAttempt`，自动护道失败后测试者点“复制摘要”即可回传原因，不需要翻日志。

v2.31.0 已完成：

- `decideAfkNextAction` 的遭遇分支改为 `autoHireGuardian || autoFight` 任一开启即可返回 `handleEncounter`。
- 低境界 1 倍测试者现在可以只开“遭遇时自动雇护道”，不开“自动迎战”；护道失败仍停住等待手动处理，不会自动开打。
- 新增 reason `encounter-auto-guardian-enabled`，日志/决策历史会显示为“已开启遭遇前自动护道”。

v2.32.0 已完成：

- 自动挂机面板新增“当前 / 上次 / 下次”三行状态，显示当前决策、上次动作和下次检查时间。
- 面板状态由 `buildAfkPanelStatus` 从配置、决策历史和循环运行时派生，不额外触发购买、战斗、复活或用丹/用符动作。
- `AfkLoopManager.formatReason` 复用共享的 `formatAfkReason`，保持日志、决策历史、面板和测试文案一致。

v2.33.0 已完成：

- 新增 `buildAfkIssueReplay`，可导入完整快照或脱敏摘要，生成 `lingverse-afk-issue-replay/v1` 问题回放视图。
- 面板新增“摘要回放”输入区，测试者粘贴摘要 JSON 后可本地查看页面、决策、神识、阻塞、风险开关、护道/用符/用丹尝试和奇遇策略行。
- 回放只解析本地文本，不调用游戏 API，不会触发探索、购买、战斗、复活、护道、用符或用丹。

v2.34.0 已完成：

- 新增 `buildAfkRiskStatus`，把自动迎战、自动护道、自动复活、战斗用符、涅槃重生丹、陌生道友婉拒、奇遇自动选择 7 个高风险动作归一为预检状态。
- 面板新增风险状态块，显示模式、风险开关数量、护道配置、用符/用丹参数和配置警告。
- 脱敏摘要 `config.riskStatus` 同步输出同一份预检结果，便于测试者发回配置问题时直接定位。
- 只读 Edge 证据：真实页面当前护道设置可读，示例为开启、独立作战、最高费用 51、优先 `normal,incarnation,body`；页面仍提示需刷新获取新版本，未执行资源动作。

v2.35.0 已完成：

- 新增 `buildAfkConfigPack`，可把当前 AFK 配置、游戏护道设置和风险预检打成 `lingverse-afk-config-pack/v1`。
- 新增 `resolveAfkConfigPackImport`，支持导入配置包或原始 AFK 配置；默认强制关闭 `enabled`，避免粘贴配置后自动启动挂机。
- 面板新增“配置包”区，支持复制当前配置包、导入测试者配置包、清空输入输出；导入只更新本地面板配置，不触发游戏 API 和资源动作。

v2.36.0 已完成：

- 新增 `mergeAdventureStrategyImport`，可从摘要回放、调试摘要或纯文本里提取 `adventureId=choiceIndex` 策略行并合并进 `adventureChoiceMap`。
- 面板“摘要回放”区新增“导入策略”按钮，粘贴测试者反馈后可直接沉淀未知奇遇策略。
- 导入策略会强制关闭 `enabled`，只更新本地配置，不触发探索、购买、战斗、护道、复活、用符或用丹。

v2.37.0 已完成：

- 新增 `reviveMaxPerRun`、`talismanMaxEncountersPerRun`、`nirvanaMaxPerRun` 三个单次挂机启动后的资源上限，`0` 表示不限。
- 富裕 50 倍预设默认设置复活 1 次、用符 3 场、用丹 1 次，降低测试者误开后连续消耗资源的风险。
- 自动复活、战斗用符、涅槃重生丹在达到本轮上限后只记录并跳过，不继续触发资源动作；风险预检会显示对应上限和到顶警告。

v2.38.0 已完成：

- 新增 `buildAfkStatusReport`，把脱敏摘要转成可读状态报告，包含版本、页面、神识、阻塞、探索、配置、资源用量、风险和奇遇策略。
- 面板新增“复制状态”按钮，测试者可先发送可读状态文本；“复制摘要”继续保留 JSON，用于开发者复现和回放。
- 状态报告只基于只读快照/摘要生成，不触发探索、购买、战斗、护道、复活、用符或用丹。

v2.39.0 已完成：

- 新增 `buildAfkWaitingDiagnosis(decisionHistory, config, now)`，从最近挂机决策历史识别“同一动作/原因连续重复且持续过久”的等待。
- 诊断对 `meditating`、`auto-explore-running` 等正常等待保持宽松；对奇遇、遭遇、陌生道友、死亡、混天典狱、资源上限耗尽等等待给出人工处理或配置建议。
- 调试摘要新增 `automation.waitDiagnosis`，状态报告在诊断激活时新增“诊断:”行，方便测试者直接粘贴等待原因。
- 等待诊断只读取决策历史和配置，不触发探索、购买、战斗、护道、复活、用符或用丹。

v2.40.0 已完成：

- 新增 `detectGameUpdateNotice(text)`，识别真实页面的“灵界已更新新版本，请点此刷新...”提示。
- `decideAfkNextAction` 在游戏更新提示出现时优先停住，默认返回 `wait/game-update-available`，避免继续按旧页面状态执行复活、战斗或探索。
- 新增 `autoReloadOnUpdate` 配置，默认关闭；测试者显式开启后，挂机循环返回 `reloadPage/game-update-auto-reload` 并刷新页面。
- 调试快照/摘要/可读状态报告新增 `gameUpdateNoticeActive` blocker，复制状态会显示“阻塞: 游戏更新”。
- 自动刷新只调用页面 reload，不触发探索、购买、战斗、护道、复活、用符或用丹。

v2.41.0 已完成：

- 新增 `automation.fight` 调试字段，记录遭遇迎战是否应该尝试、触发来源、失败原因和当前 encounter key。
- 自动迎战会记录 `button`、`page-function` 或 `api` 来源；异常和接口失败会脱敏进入复制摘要/复制状态。
- 可读状态报告的“自动化”行新增“迎战 reason”，测试者不用翻 JSON 也能确认 50 倍富裕模式是否真的点了迎战。
- 迎战报告只记录已有动作结果；不开 `autoFight` 时不会触发战斗。

v2.42.0 已完成：

- 新增 `buildAfkPhaseStatus(state, config, decision, now)`，把当前挂机阶段归一成 `lingverse-afk-phase-status/v1`。
- 阶段报告覆盖冥想已过/计划剩余、满神识提前结束、探索倍率、卡住判定、恢复窗口和阻塞原因。
- 调试快照/摘要新增 `phase`，可读状态报告新增“阶段:”行，测试者复制状态即可确认 140 分钟自定义循环还剩多久。
- `window.LingVerseAutoMapVersion` 和测试 hook 暴露当前脚本版本，方便 Agent Browser CLI 只读检查真实页面安装版本。
- 阶段报告只读派生，不参与 `decideAfkNextAction`，不会触发探索、购买、战斗、护道、复活、用符或用丹。

v2.43.0 已完成：

- 新增 `buildAfkResourcePreflight(items, config, player, now, usage)`，从只读背包数据生成 `lingverse-afk-resource-preflight/v1`。
- 预检报告覆盖战斗符箓 family 数、按配置选中的符箓、史诗+涅槃重生丹是否可用、资源上限和跳过原因。
- 复制状态/复制摘要在开启战斗用符或涅槃重生丹时额外只读 `getInventory`，读取失败只记录“未读取背包”，不影响复制。
- 可读状态报告新增“预检:”行和预检 warning，帮助富裕 50 倍测试者先确认有几类符、有没有符合品质的丹。
- 真实只读证据显示当前账号有 5 类战斗符箓，但没有 `bp_pill_rebirth_*` 涅槃重生丹；`pill_nirvana_*` 九转还魂丹仍被正确排除。

v2.44.0 已完成：

- 新增 `applyAfkPreset(config, 'guardian')` 护道 1 倍预设。
- 护道预设固定为 1 倍探索、开启遭遇前自动护道，关闭自动迎战、自动复活、战斗用符、涅槃重生丹和陌生道友自动婉拒。
- 护道预设继续保留测试者已有的恢复窗口、奇遇策略表和符箓 family 偏好，并且不会自动启动挂机。
- 面板新增“套用护道1倍”按钮，方便低境界测试者少手动组合高风险开关。
- 可读状态报告新增“护道:”行，用中文展示护道 ready/失败/已触发/已尝试、失败消息和游戏护道配置。
- 真实只读证据显示当前账号游戏护道设置已开启，模式独立作战，最高费用 51，优先级 `normal>incarnation>body`；本次未点击探索、护道、战斗、复活、用符或用丹。

v2.45.0 已完成：

- 新增 `buildAfkEnvironmentStatusLine(summary)`，从脱敏摘要只读生成环境提示。
- 当游戏更新 blocker 出现时，可读状态报告新增 `环境: helper 版本 · 游戏更新提示，先刷新页面/重载扩展`。
- 目的：测试者复制状态时能直接看出当前卡点是游戏页面更新/扩展版本未刷新，而不是挂机状态机误判。
- 真实只读证据显示当前 Edge 页仍有“灵界已更新新版本”提示，且 `window.LingVerseAutoMapVersion=null`，这类场景需要刷新页面或重载扩展后再继续实测。

v2.46.0 已完成：

- 新增 `buildAfkAdventureStatusLine(summary)`，从脱敏摘要只读生成当前奇遇样本行。
- 可读状态报告在当前奇遇存在时新增 `奇遇: #ID 第x/y步 · 1.选项 / 2.选项`。
- 目的：测试者只发可读状态时也能回传 adventureId、步骤和选项文本，便于把真实奇遇沉淀到 `adventureChoiceMap`。
- 奇遇样本行只读派生，不自动选择选项，不导入策略，也不改变挂机决策。

v2.47.0 已完成：

- 恢复窗口阶段现在读取 `postReviveResumeRemainingSeconds` / `postInteractionResumeRemainingSeconds`。
- `buildAfkPhaseStatus` 在复活/事件恢复窗口中输出剩余秒数和下一步倾向，例如“神识足够将继续50倍探索”或“神识不足将回冥想”。
- 可读状态报告新增 `恢复:` 行，帮助富裕 50 倍测试者判断战斗/奇遇/护道处理后是在等结算继续探索，还是应该回冥想。
- `AfkLoopManager.buildSnapshot()` 会把真实恢复窗口剩余秒数写入状态，报告只读展示，不改变 tick 调度。

v2.48.0 已完成：

- 可读状态报告新增 `回冥想:` 行，覆盖自动探索低神识、页面提示神识不足、普通低神识、复活/事件后低神识和探索疑似卡住。
- `回冥想:` 行会显示简短原因、当前神识/上限、单次探索消耗和最低神识阈值，例如 `回冥想: 自动探索神识不足 · 当前3/2758 · 单次4 · 阈值20`。
- 目的：测试者只复制状态时即可判断“停住”是正常回冥想闭环，还是需要继续排查事件/战斗/更新阻塞。

v2.49.0 已完成：

- 可读状态报告新增 `护道建议:` 行，覆盖游戏护道关闭、自动护道失败、本遭遇已尝试、可尝试/已触发等低境界护道 1 倍常见状态。
- 护道失败时会提示检查灵石、最高费用、最低攻击力，并建议调整游戏护道设置后手动处理当前遭遇。
- 目的：低境界测试者卡在遭遇时，只复制状态即可知道是游戏护道未开、费用/门槛问题、已尝试过避免重复扣费，还是等待页面结算。

v2.50.0 已完成：

- 可读状态报告新增 `迎战:` 和 `迎战建议:` 行，覆盖自动迎战失败、尚未迎战和已触发自动迎战。
- `迎战:` 行会显示触发来源（遭遇按钮、页面函数、接口、异常）和脱敏失败消息。
- 目的：富裕 50 倍测试者用符后复制状态即可确认是否真的迎战、从哪个入口触发、失败后应该手动迎战还是复制摘要排障。

v2.51.0 已完成：

- 可读状态报告新增 `用符:` 和 `用符建议:` 行，覆盖已完成、部分失败、无可用符、背包读取失败、次数上限、已选中/待执行和本遭遇已处理等状态。
- `用符:` 行会显示成功/失败 family 数、选中的 family 顺序和脱敏失败消息。
- 目的：富裕 50 倍测试者复制状态时能先判断是否卡在“用符”阶段，再继续排查迎战、结算、复活或恢复窗口。

v2.52.0 已完成：

- 可读状态报告新增 `用丹:` 和 `用丹建议:` 行，覆盖已有五行通灵、次数上限、背包读取失败、未找到满足品质丹药、找到可用丹药、已使用和使用失败。
- `用丹:` 行会显示丹药品质、丹药名和脱敏失败消息；真实执行路径会把背包读取失败、用丹失败和用丹成功写入 `lastNirvanaPillAttempt`。
- 目的：富裕 50 倍测试者复制状态时能判断是否卡在“探索前用丹”阶段，并继续避免把 `pill_nirvana_*` 九转还魂丹误当成五行通灵类涅槃重生丹。

v2.53.0 已完成：

- 调试摘要新增 `automation.revive`，记录自动复活是否准备、已触发、失败、关闭、未死亡或达到本轮上限。
- 可读状态报告新增 `复活:` 和 `复活建议:` 行，展示复活触发来源、脱敏失败消息和下一步建议。
- 真实复活执行路径会把本轮上限、页面函数/API 成功触发和异常失败写入 `lastReviveAttempt`，方便富裕 50 倍战死后判断是卡在复活、恢复窗口还是回冥想。

v2.54.0 已完成：

- 调试摘要新增 `automation.exploreStart`，记录自动探索启动是否准备、已触发、失败、已运行、无需求或关闭。
- 可读状态报告新增 `探索启动:` 和 `探索建议:` 行，展示探索倍率、触发来源、脱敏失败消息和下一步建议。
- 真实自动探索启动路径会把准备启动、按钮/页面函数/单次探索入口成功触发和异常失败写入 `lastExploreStartAttempt`，方便判断富裕 50 倍是否卡在“用丹后重新开始探索”或恢复窗口后的启动环节。

v2.55.0 已完成：

- 调试摘要新增 `automation.merchant`，记录自动商人是否检测到窗口、读取失败、无可买商品、准备购买、已触发购买或购买失败。
- 可读状态报告新增 `商人:` 和 `商人建议:` 行，展示最高价商品名、价格、触发来源、脱敏失败消息和下一步建议。
- 真实 `MerchantAutoBuyer` 会把读商人失败、无可买商品、购买成功触发和购买失败写入 `lastAttempt`，方便判断自动探索暂停时是否卡在云游商人。

v2.56.0 已完成：

- 调试摘要新增 `automation.meditation`，记录进入/结束冥想是否准备、已触发或失败。
- 可读状态报告新增 `冥想:` 和 `冥想建议:` 行，展示页面函数/API 来源、已冥想时长、计划分钟、脱敏失败消息和下一步建议。
- 真实 `startMeditation` / `stopMeditation` 执行路径会写入 `lastMeditationAttempt`，方便判断 140 分钟循环是否卡在冥想或收功阶段。

v2.57.0 已完成：

- 新增 `buildAfkPresetStatus(config)`，比较当前挂机配置和稳妥 1 倍、护道 1 倍、富裕 50 倍预设的关键自动化开关。
- 调试摘要新增 `config.presetStatus`，记录是否匹配预设、最接近的预设和关键偏离项。
- 可读状态报告新增 `模式:` 行，例如 `护道1倍 · 已匹配预设` 或 `自定义 · 接近富裕50倍 · 偏离1项: 自动复活应开启`，方便多人测试时复现相同配置。

v2.58.0 已完成：

- `normalizeCombatTalismanAttempt` / `summarizeCombatTalismanAttempt` 新增符箓面板关闭状态、关闭来源和关闭失败消息。
- 真实 `useCombatTalismans` 执行路径会在用符后记录 `hideEncounterTalismanDialog`、DOM 兜底、未找到面板或异常失败。
- 可读状态报告的 `用符:` / `用符建议:` 会显示“符窗已关闭/符窗未关闭”和关闭失败建议，方便定位富裕 50 倍是否卡在符箓面板而没有继续迎战。

v2.59.0 已完成：

- `buildAfkWaitingDiagnosis` 新增 `likelyCause`，在重复等待/重复自动处理时从最近自动化尝试里推断可能根因。
- 可读状态报告在 `诊断:` 后追加 `诊断归因:`，例如符箓面板未关闭、自动护道失败、自动迎战失败、复活失败、商人购买失败或探索启动失败。
- 该归因只读取快照、决策历史和最近尝试结果，不额外触发探索、购买、战斗、护道、复活、用符或用丹。

v2.60.0 已完成：

- 新增 `resolveEncounterFightAttempt`，用 encounter key 给自动迎战做同遭遇去重。
- `fightEncounter` 触发迎战后会记录 `lastFightEncounterKey`；同一个遭遇/战斗状态残留期间后续 tick 只等待结算，不重复点击迎战。
- 当遭遇/战斗状态消失时清空迎战 key，新遭遇仍会按配置重新允许自动迎战。

v2.61.0 已完成：

- `resolveEncounterFightAttempt` 会读取最近一次战斗用符尝试；如果当前遭遇的符箓面板仍未关闭，返回 `talisman-dialog-open` 并阻断自动迎战。
- 真实 `fightEncounter` 把 `lastTalismanAttempt` 传入迎战决策，符箓面板没关时不会点击迎战按钮、调用页面函数或调用迎战 API。
- 可读状态报告新增迎战侧的“符箓面板未关闭”阻断和建议，测试者不需要先触发迎战失败也能定位“用符 -> 关窗 -> 迎战”链路卡点。

v2.62.0 已完成：

- 快照新增 `talismanDialogActive`，单独记录当前符箓面板是否仍可见。
- `resolveEncounterFightAttempt` 优先使用当前快照里的符箓面板状态；当前面板明确已关闭时，即使上一条用符记录为 `dialogClosed=false`，也会恢复到正常迎战判断。
- 当前快照明确显示符箓面板打开时，即使缺少上一条用符记录，也会阻断自动迎战，避免绕过面板可见状态。

v2.63.0 已完成：

- `normalizeMeditationAttempt` / `summarizeMeditationAttempt` 新增 `triggerReason`，保留结束冥想的上游原因。
- `buildMeditationDebugAttempt` 在 `stopMeditation` 决策中记录 `spirit-full` 或 `meditation-duration-reached`；真实 `stopMeditation` 执行路径的 ready/triggered/failed 记录也会携带该原因。
- 可读状态报告的 `冥想:` / `冥想建议:` 会明确显示“神识已满”或“冥想时长已到”，方便测试者区分满神识提前收功和 140 分钟到点收功。

v2.64.0 已完成：

- `buildAfkWaitLikelyCause` 对恢复窗口重复 `startAutoExplore` 失败增加专属归因。
- `post-interaction-ready` 会显示“事件恢复后未能重启探索 · 自动探索启动失败 · ...”，`post-revive-ready` 会显示“复活恢复后未能重启探索 · 自动探索启动失败 · ...”。
- `getAfkWaitingDiagnosisMeta` 为恢复窗口反复启动探索失败增加专属建议，提示检查自动探索入口/倍率控件、必要时手动点一次自动探索并复制摘要。
- 目的：富裕 50 倍战斗/奇遇/护道处理后，如果恢复窗口到期但自动探索没有真正接上，测试者复制状态就能知道是恢复续跑失败，而不是误以为还在正常等待。

v2.65.0 已完成：

- `buildAfkWaitLikelyCause` 对 `guardian-already-attempted` 增加专属归因，状态报告会显示“本遭遇已尝试自动护道，避免重复扣费”。
- 对 `hire-triggered` 增加只读归因，状态报告可显示“自动护道已触发，等待遭遇结算”。
- `encounter-auto-guardian-enabled` 的重复等待建议改为护道专属文案，提示确认护道结算或手动处理当前遭遇。
- 目的：低境界护道 1 倍模式下，同一遭遇不会重复扣费；如果页面一直停在遭遇，测试者复制状态即可知道脚本不是漏点，而是在等待人工/结算。

v2.66.0 已完成：

- `buildAfkWaitLikelyCause` 对奇遇自动选择重复等待增加专属归因。
- `adventure-auto-choice` / `adventure-strategy-choice` 会显示当前奇遇 ID、自动选择的第几项和选项文本，例如“奇遇#456 自动选择第2项「绕路离开」后仍未前进”。
- `getAfkWaitingDiagnosisMeta` 为奇遇自动选择重复未前进增加专属建议，提示检查当前奇遇选项/策略是否匹配，必要时手动处理并复制摘要。
- 目的：奇遇策略表可分享后，测试者遇到策略没推进时不用只发截图；复制状态即可定位是哪条奇遇策略可能不适配。

v2.67.0 已完成：

- `buildAfkWaitLikelyCause` 对陌生道友自动婉拒重复等待增加专属归因。
- `player-encounter-auto-decline` 会显示“陌生道友自动婉拒后仍未关闭”。
- `getAfkWaitingDiagnosisMeta` 为陌生道友自动婉拒重复未前进增加专属建议，提示检查邂逅弹窗/按钮，必要时手动处理并复制摘要。
- 目的：富裕 50 倍模式开启自动婉拒后，如果陌生道友弹窗未关闭，测试者复制状态即可知道卡在婉拒链路，而不是误判为探索/战斗卡住。

v2.68.0 已完成：

- `automation.playerEncounter` 进入调试快照、脱敏摘要、可读状态报告和摘要回放自动化概览。
- `handlePlayerEncounter` 会记录 `decline-ready`、`decline-triggered`、`decline-failed`，并保留触发来源：`pvp-dismiss`、`invite-decline`、`session-leave`、`button`、`missing-entry` 或 `exception`。
- 状态报告新增“陌生道友:”和“陌生道友建议:”行，失败消息会按现有摘要规则脱敏，例如 `token=...` 会变成 `token=<redacted>`。
- 目的：不必等到重复等待诊断触发，测试者第一次复制状态就能看到自动婉拒是否已经触发、卡在哪个入口、是否需要手动处理。

v2.69.0 已完成：

- `automation.adventureAttempt` 进入调试快照、脱敏摘要、可读状态报告和摘要回放自动化概览。
- `handleAdventure` 会记录 `choice-ready`、`choice-triggered`、`choice-failed`、`close-ready`、`close-triggered`、`close-failed`，并保留奇遇 ID、选项序号、选项文本和触发来源。
- 状态报告新增“奇遇动作:”和“奇遇建议:”行，失败消息会按现有摘要规则脱敏。
- 目的：奇遇策略表测试时，不必等到重复未推进诊断；第一次复制状态即可知道脚本准备点哪一项、是否已触发、是否策略未命中或按钮不可点。

v2.70.0 已完成：

- `buildAfkStatusReport` 对 `immortalPrisonActive` 增加即时 hard-stop 行。
- 状态报告新增“硬停: 混天典狱 · 脚本暂停自动探索”和“硬停建议: 混天典狱需要手动处理 · 脚本不会自动跳过、自动点击或消耗资源”。
- 目的：测试者遇到混天典狱时能立刻知道这是安全硬停，不是自动探索、冥想、商人或战斗链路失灵。

v2.71.0 已完成：

- `lingverse-extension-loader.js` 会读取扩展 manifest 版本，写入 `document.documentElement.dataset.lingverseAutoMapExtensionVersion`，并给注入脚本 URL 增加 `?v=<扩展版本>`。
- `buildAfkDebugSnapshot` / `buildAfkDebugSummary` 新增 `environment.extensionVersion` 和 `versionMismatch`。
- `buildAfkStatusReport` 在 helper 版本和扩展版本不一致时输出“环境: helper ... · 扩展 ... · 版本不一致，重载扩展并刷新页面”。
- 目的：多人测试时先确认测试者是否真的加载最新版，避免把旧页面、旧扩展或缓存问题误判为挂机逻辑失败。

v2.72.0 已完成：

- 首次初始化面板时写入 `window.LingVerseAutoMapInitializedVersion`。
- `buildAfkDebugSnapshot` / `buildAfkDebugSummary` 的 `environment` 新增 `initializedVersion`、`autoMapInited`、`initializedVersionMismatch` 和 `initializedVersionMissing`。
- `buildAfkStatusReport` 在 helper 顶层版本和面板初始化版本不一致时输出“环境: helper ... · 面板 ... · 页面仍是旧初始化，刷新页面”。
- 目的：扩展重载后，新脚本可能已重新注入，但旧面板和旧事件监听仍在页面上；测试者复制状态时能先发现这个环境问题。

风险：

- 50 倍遇怪失败会损失预扣神识。
- 复活和丹药都消耗资源。
- 自动护道会消耗灵石或护道资源，必须由测试者显式开启，且以游戏当前护道设置为准。
- 符箓 family 顺序仍需要玩家按账号库存和实战收益调优。
- 当前账号未读到 `bp_pill_rebirth_*`，所以涅槃重生丹分支只做了选择/尝试决策测试，未做真实消耗验证。
- 奇遇链涉及剧情分支和奖励选择，固定选择必须由测试者显式开启，默认不能自动点。

## 第四阶段：脚本体验打磨

- 面板里增加“当前决策/上次动作/下次检查时间”。（v2.32.0 已完成）
- 导出调试快照，方便其他测试者反馈。（v2.14.0 快照 / v2.25.0 摘要 / v2.33.0 回放）
- 为每个高风险动作显示独立开关状态。（v2.34.0 已完成）
- 给富裕模式加资源保险丝，避免单次挂机连续复活/用符/用丹。（v2.37.0 已完成）
- 给测试者一键复制可读状态报告，减少反馈门槛。（v2.38.0 已完成）
- 给状态报告增加重复等待诊断，区分正常等待和疑似需要人工/配置介入的卡点。（v2.39.0 已完成）
- 给真实页面更新提示增加 blocker 和 opt-in 自动刷新，避免长跑停在旧版本提示。（v2.40.0 已完成）
- 给自动迎战增加触发来源/失败原因报告，帮助富裕 50 倍测试定位“用符后是否真的迎战”。（v2.41.0 已完成）
- 给长跑循环增加阶段/剩余时间报告，帮助测试者确认冥想周期和探索周期是否按配置推进。（v2.42.0 已完成）
- 给冥想执行报告增加收功触发原因，区分满神识提前收功和到点收功。（v2.63.0 已完成）
- 给富裕模式增加只读资源预检，避免测试者盲开 50 倍后才发现没符或没有涅槃重生丹。（v2.43.0 已完成）
- 给低境界测试者增加护道 1 倍预设和护道中文状态行，避免手动误开迎战/复活/符丹。（v2.44.0 已完成）
- 给护道 1 倍重复等待增加“已尝试，避免重复扣费”归因，降低低境界测试者误判脚本漏点的反馈成本。（v2.65.0 已完成）
- 给游戏更新 blocker 增加环境提示，减少“测试者没加载最新版/页面未刷新”导致的反馈噪音。（v2.45.0 已完成）
- 给可读状态报告增加奇遇 ID/步骤/选项样本，降低真实奇遇策略沉淀门槛。（v2.46.0 已完成）
- 给奇遇自动选择重复未前进增加专属归因，降低策略表不适配时的排障成本。（v2.66.0 已完成）
- 给陌生道友自动婉拒重复未关闭增加专属归因，降低事件弹窗结构变化时的排障成本。（v2.67.0 已完成）
- 给陌生道友自动婉拒增加即时尝试状态行，降低首次失败时的反馈成本。（v2.68.0 已完成）
- 给奇遇自动选择/关闭增加即时尝试状态行，降低首次失败时的反馈成本。（v2.69.0 已完成）
- 给混天典狱 hard-stop 增加即时状态行，避免测试者误判为挂机失灵。（v2.70.0 已完成）
- 给 helper/扩展版本漂移增加即时环境提示，降低测试者仍跑旧脚本时的排障成本。（v2.71.0 已完成）
- 给 helper/面板初始化版本漂移增加即时环境提示，降低扩展重载后旧面板残留的排障成本。（v2.72.0 已完成）
- 给复活/事件恢复窗口增加剩余时间和下一步倾向报告，降低富裕 50 倍战斗恢复链路排障难度。（v2.47.0 已完成）
- 给可读状态报告增加预设匹配/偏离诊断，降低测试者“同名模式不同开关组合”导致的复现噪音。（v2.57.0 已完成）
- 给战斗用符报告增加符箓面板关闭状态，降低“用符完成但没进入迎战”的排障难度。（v2.58.0 已完成）
- 给重复等待诊断增加自动化尝试归因，降低“状态报告说卡住但还要人猜卡在哪一步”的反馈成本。（v2.59.0 已完成）
- 给恢复窗口重复启动探索失败增加专属归因，降低“战斗/事件后没续上探索”的排障难度。（v2.64.0 已完成）
- 给自动迎战增加同遭遇去重，降低恢复窗口/战斗结算期间重复触发迎战的风险。（v2.60.0 已完成）
- 给自动迎战增加符箓面板未关闭阻断，避免用符界面遮挡时继续误点迎战。（v2.61.0 已完成）
- 给符箓面板阻断增加当前快照恢复路径，避免手动关窗后仍被旧失败记录卡住。（v2.62.0 已完成）
- 给测试者一个建议配置：
  - 低境界：护道 1 倍预设、护道交给游戏设置、不开复活/丹/符。
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
- `decideAfkNextAction` 只有 `autoHireGuardian` 或 `autoFight` 开启时才把遭遇交给自动 handler。

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

v2.28.0 新增自动测试：

- `buildAfkDebugSummary` 会为奇遇选项输出 `strategyHints`，包含脱敏选项文本和可复制的 `adventureId=choiceIndex` 策略行。

v2.29.0 新增自动测试：

- `buildAfkDebugSnapshot` 会输出最近一次战斗符箓尝试，包括 encounter key、选中符箓、使用/失败数量和失败消息。
- `buildAfkDebugSummary` 会脱敏并截断用符名称、encounter key 和失败消息，避免测试者回传 token-like 文本。

v2.30.0 新增自动测试：

- `buildAfkDebugSnapshot` 会输出最近一次自动护道尝试，包括 encounter key、护道设置、是否触发雇佣和失败消息。
- `buildAfkDebugSummary` 会脱敏并截断护道 encounter key 和失败消息，避免测试者回传 token-like 文本。

v2.31.0 新增自动测试：

- `decideAfkNextAction` 覆盖 `autoHireGuardian=true` 且 `autoFight=false` 时仍进入遭遇 handler，reason 为 `encounter-auto-guardian-enabled`。
- 保留两个开关都关闭时遭遇等待、只开自动迎战时直接进入 handler 的回归覆盖。

v2.32.0 新增自动测试：

- `buildAfkPanelStatus` 覆盖未启动、运行中最近决策、检查中三种面板状态，验证当前决策、上次动作和下次检查时间格式。

v2.33.0 新增自动测试：

- `buildAfkIssueReplay` 覆盖粘贴脱敏摘要 JSON 后生成回放视图，包含决策、神识、阻塞、风险开关、自动化尝试和奇遇策略导入行。

v2.34.0 新增自动测试：

- `buildAfkRiskStatus` 覆盖低境界 1 倍护道模式和富裕 50 倍模式，验证风险开关计数、护道参数、用符/用丹参数和空策略警告。
- `buildAfkDebugSummary` 覆盖 `config.riskStatus`，确保测试者发回摘要时带同一份预检结果。

v2.35.0 新增自动测试：

- `buildAfkConfigPack` 覆盖富裕模式配置导出，验证 AFK 参数、游戏护道设置、风险状态和脱敏 label。
- `resolveAfkConfigPackImport` 覆盖配置包安全导入，验证导入时自动关闭挂机启动状态并保留护道优先级。

v2.36.0 新增自动测试：

- `mergeAdventureStrategyImport` 覆盖从回放策略文本和调试摘要 `strategyHints.mapLine` 导入策略，验证覆盖计数、策略表合并，以及导入时关闭挂机启动状态。

v2.37.0 新增自动测试：

- `resolveAfkResourceBudget` 覆盖复活本轮上限，验证达到上限后 `decideAfkNextAction` 不再自动复活。
- `resolveNirvanaRebirthPillAttempt` 覆盖用丹本轮上限，验证达到上限后返回 `budget-exhausted`，不选择丹药。
- `applyAfkPreset('rich')` 覆盖富裕预设默认资源保险丝。

v2.38.0 新增自动测试：

- `buildAfkStatusReport` 覆盖从脱敏摘要生成可读状态报告，验证版本、决策、神识、阻塞、资源用量、风险警告和奇遇策略行。

v2.39.0 新增自动测试：

- `buildAfkWaitingDiagnosis` 覆盖连续 5 次等待同一奇遇阻塞、持续 10 分钟时生成 warning 诊断。
- `buildAfkDebugSummary` / `buildAfkStatusReport` 覆盖等待诊断进入脱敏摘要和可读状态报告。

v2.40.0 新增自动测试：

- `detectGameUpdateNotice` 覆盖真实更新提示文本识别。
- `decideAfkNextAction` 覆盖更新提示默认等待、开启 `autoReloadOnUpdate` 后返回刷新页面，且优先于死亡/商人等资源动作。
- `buildAfkDebugSummary` / `buildAfkStatusReport` 覆盖游戏更新 blocker 进入脱敏摘要和可读状态报告。

v2.41.0 新增自动测试：

- `normalizeEncounterFightAttempt` 覆盖迎战尝试字段归一化导出。
- `buildAfkDebugSummary` / `buildAfkStatusReport` 覆盖迎战失败来源、失败消息脱敏和可读状态报告中的“迎战”行。

v2.42.0 新增自动测试：

- `buildAfkPhaseStatus` 覆盖冥想已过/剩余、满神识提前结束和探索倍率/卡住判定。
- `buildAfkStatusReport` 覆盖可读状态报告新增“阶段:”行。

v2.43.0 新增自动测试：

- `buildAfkResourcePreflight` 覆盖真实相似库存：5 类战斗符箓可用、`pill_nirvana_*` 九转还魂丹不会被误判为涅槃重生丹。
- `buildAfkStatusReport` 覆盖“预检:”行和富裕资源 warning。

v2.44.0 新增自动测试：

- `applyAfkPreset('guardian')` 覆盖护道 1 倍预设，验证只开启 `autoHireGuardian`，关闭迎战、复活、用符、用丹，并保留恢复窗口和奇遇策略。
- `buildAfkStatusReport` 覆盖护道失败时的中文状态行，包含失败消息和游戏护道配置。

v2.45.0 新增自动测试：

- `buildAfkStatusReport` 覆盖游戏更新 blocker 时输出环境提示，包含 helper 版本和刷新/重载扩展建议。

v2.46.0 新增自动测试：

- `buildAfkStatusReport` 覆盖当前奇遇时输出 `奇遇:` 样本行，包含 adventureId、步骤、总步数和选项文本。

v2.47.0 新增自动测试：

- `buildAfkDebugSnapshot` / `buildAfkDebugSummary` / `buildAfkStatusReport` 覆盖 `postInteractionResume` 剩余 45 秒时输出恢复窗口 phase 和 `恢复:` 行。

v2.48.0 新增自动测试：

- `buildAfkDebugSnapshot` / `buildAfkDebugSummary` / `buildAfkStatusReport` 覆盖自动探索恢复挂起但神识 `3/2758`、单次消耗 `4`、阈值 `20` 时输出 `回冥想:` 行。

v2.49.0 新增自动测试：

- `buildAfkStatusReport` 覆盖 `automation.guardian.reason=hire-failed` 时输出 `护道建议:` 行，提示检查灵石、最高费用和最低攻击力。

v2.50.0 新增自动测试：

- `buildAfkDebugSnapshot` / `buildAfkDebugSummary` / `buildAfkStatusReport` 覆盖 `fight-failed`、`page-function` 来源和脱敏失败消息时输出 `迎战:` / `迎战建议:` 行。

v2.51.0 新增自动测试：

- `buildAfkDebugSnapshot` / `buildAfkDebugSummary` / `buildAfkStatusReport` 覆盖战斗用符 `completed` 且部分失败时输出 `用符:` / `用符建议:` 行，并确认失败消息里的 token 被脱敏。

v2.52.0 新增自动测试：

- `buildAfkDebugSnapshot` / `buildAfkDebugSummary` / `buildAfkStatusReport` 覆盖涅槃重生丹 `use-failed`、丹药名脱敏和失败消息脱敏时输出 `用丹:` / `用丹建议:` 行。

v2.53.0 新增自动测试：

- `buildAfkDebugSnapshot` / `buildAfkDebugSummary` / `buildAfkStatusReport` 覆盖自动复活 `revive-failed`、`page-function` 来源和脱敏失败消息时输出 `复活:` / `复活建议:` 行。

v2.54.0 新增自动测试：

- `buildAfkDebugSnapshot` / `buildAfkDebugSummary` / `buildAfkStatusReport` 覆盖自动探索启动 `start-failed`、`toggle` 来源、50 倍倍率和脱敏失败消息时输出 `探索启动:` / `探索建议:` 行。

v2.55.0 新增自动测试：

- `buildAfkDebugSnapshot` / `buildAfkDebugSummary` / `buildAfkStatusReport` 覆盖自动商人 `purchase-failed`、`api` 来源、商品名/价格和脱敏失败消息时输出 `商人:` / `商人建议:` 行。

v2.56.0 新增自动测试：

- `buildAfkDebugSnapshot` / `buildAfkDebugSummary` / `buildAfkStatusReport` 覆盖结束冥想 `stop-failed`、`page-function` 来源、已冥想 140 分钟和脱敏失败消息时输出 `冥想:` / `冥想建议:` 行。

v2.57.0 新增自动测试：

- `buildAfkPresetStatus` 覆盖护道 1 倍预设匹配，以及富裕 50 倍少开自动复活时输出最接近预设和偏离项。
- `buildAfkStatusReport` 覆盖 `模式:` 行进入可读状态报告。

v2.58.0 新增自动测试：

- `buildAfkDebugSnapshot` / `buildAfkDebugSummary` / `buildAfkStatusReport` 覆盖战斗用符完成但符箓面板关闭失败时输出 `符窗未关闭`、脱敏关闭失败消息和下一步建议。

v2.59.0 新增自动测试：

- `buildAfkWaitingDiagnosis` / `buildAfkDebugSummary` / `buildAfkStatusReport` 覆盖连续卡在自动遭遇处理时从战斗用符尝试推断 `符箓面板未关闭`，并输出脱敏 `诊断归因:` 行。

v2.60.0 新增自动测试：

- `resolveEncounterFightAttempt` 覆盖自动迎战关闭、准备迎战、触发后标记 encounter key、同一遭遇跳过重复迎战，以及新遭遇重新允许迎战。

v2.61.0 新增自动测试：

- `resolveEncounterFightAttempt` 覆盖当前遭遇符箓面板未关闭时返回 `talisman-dialog-open` 并阻断自动迎战。
- `buildAfkDebugSummary` / `buildAfkStatusReport` 覆盖战斗用符面板关闭失败时同时输出 `迎战:` 和 `迎战建议:` 的符箓面板阻断说明。

v2.62.0 新增自动测试：

- `resolveEncounterFightAttempt` 覆盖当前快照显示符箓面板已关闭时，从旧 `dialogClosed=false` 记录恢复到 `fight-ready`。
- `resolveEncounterFightAttempt` 覆盖当前快照显示符箓面板仍打开时，即使没有最近用符记录也返回 `talisman-dialog-open`。
- `buildAfkDebugSnapshot` 覆盖 `blockers.talismanDialogActive` 写入调试快照，方便复制摘要判断阻断是否还能恢复。

v2.63.0 新增自动测试：

- `buildAfkDebugSnapshot` / `buildAfkDebugSummary` / `buildAfkStatusReport` 覆盖 `stopMeditation/spirit-full` 时输出 `triggerReason=spirit-full`、`冥想: ... 神识已满` 和提前收功建议。

v2.64.0 新增自动测试：

- `buildAfkDebugSnapshot` / `buildAfkDebugSummary` / `buildAfkStatusReport` 覆盖恢复窗口连续 `startAutoExplore/post-interaction-ready` 失败时输出专属建议和 `诊断归因: 事件恢复后未能重启探索 · 自动探索启动失败 · ...`。

v2.65.0 新增自动测试：

- `buildAfkDebugSnapshot` / `buildAfkDebugSummary` / `buildAfkStatusReport` 覆盖护道 1 倍同一遭遇已尝试自动护道后重复等待时输出专属建议和 `诊断归因: 本遭遇已尝试自动护道，避免重复扣费`。

v2.66.0 新增自动测试：

- `buildAfkDebugSnapshot` / `buildAfkDebugSummary` / `buildAfkStatusReport` 覆盖奇遇策略 `456=2` 重复未推进时输出专属建议和 `诊断归因: 奇遇#456 自动选择第2项「绕路离开」后仍未前进`。

v2.67.0 新增自动测试：

- `buildAfkDebugSnapshot` / `buildAfkDebugSummary` / `buildAfkStatusReport` 覆盖陌生道友自动婉拒重复未关闭时输出专属建议和 `诊断归因: 陌生道友自动婉拒后仍未关闭`。

v2.68.0 新增自动测试：

- `buildAfkDebugSnapshot` / `buildAfkDebugSummary` / `buildAfkStatusReport` 覆盖陌生道友自动婉拒尝试进入 `automation.playerEncounter`，状态报告输出“陌生道友: 自动婉拒失败 · 邂逅卡关闭 · ...”和对应建议，并验证失败消息脱敏。

v2.69.0 新增自动测试：

- `buildAfkDebugSnapshot` / `buildAfkDebugSummary` / `buildAfkStatusReport` 覆盖奇遇自动选择尝试进入 `automation.adventureAttempt`，状态报告输出“奇遇动作: 自动选择失败 · #456 · 第2项「绕路离开」 · 选项按钮 · ...”和对应建议，并验证失败消息脱敏。

v2.70.0 新增自动测试：

- `buildAfkDebugSnapshot` / `buildAfkDebugSummary` / `buildAfkStatusReport` 覆盖混天典狱 hard-stop，状态报告无需等待重复诊断即可输出“硬停:”和“硬停建议:”。

v2.71.0 新增自动测试：

- `lingverse-extension-loader.js` 覆盖扩展版本写入 DOM、脚本 URL 版本参数和同版本重复注入跳过。
- `buildAfkDebugSnapshot` / `buildAfkDebugSummary` / `buildAfkStatusReport` 覆盖 helper/扩展版本不一致时输出环境提示。

v2.72.0 新增自动测试：

- `buildAfkDebugSnapshot` 覆盖从页面全局读取面板初始化版本，并识别初始化版本落后于 helper 顶层版本。
- `buildAfkDebugSummary` / `buildAfkStatusReport` 覆盖 helper/面板初始化版本不一致时输出“页面仍是旧初始化，刷新页面”。

v2.73.0 新增自动测试：

- `parseMeditationBarState` 覆盖真实页面 `#meditationBar` 文本，如“冥想修炼中 / 1时30分 / 收功”，解析为冥想中且已冥想 5400 秒。
- `parseMeditationBarState` 覆盖聊天/日志里的历史“收功/修炼时长”文本，确保不会误判为当前冥想条。
- `AfkLoopManager.buildSnapshot` 在冥想接口或 `_lastPlayerData.isMeditating` 不同步时，会用当前可见 `#meditationBar` 兜底生成 `isMeditating` 和 `meditationDurationSeconds`，让原有 `stopMeditation` 决策继续按自定义分钟或满神识收功。

v2.74.0 新增自动测试：

- `decideAfkNextAction` 覆盖 `canExplore=false` 且 `exploreDisabledReason` 为空、但神识已经低于阈值或单次消耗时，直接返回 `startMeditation/explore-disabled-no-spirit`。
- 目的：页面没有写出“神识不足/体力不足”禁用原因时，低神识账号也不会停在“当前区域不可探索”等待，而是按挂机循环回冥想。

v2.75.0 新增自动测试：

- `parseMeditationBarState` 覆盖真实页面冥想条 `恢复: ... / 914识`，解析 `recoveredSpirit`。
- `decideAfkNextAction` 覆盖 `meditationSpiritFromBar=true` 且 `spirit + meditationRecoveredSpirit >= maxSpirit` 时返回 `stopMeditation/spirit-full`。
- 目的：真实页出现冥想条还在增长、但 `_lastPlayerData.spirit/isMeditating` 缓存滞后时，满神识提前收功仍可靠。

v2.76.0 新增自动测试：

- `buildAfkDebugSummary` 覆盖冥想条恢复兜底字段进入脱敏摘要：`player.meditationRecoveredSpirit` 与 `player.meditationSpiritFromBar`。
- `buildAfkStatusReport` 覆盖兜底激活时输出 `冥想兜底:`，显示冥想条恢复神识、缓存神识和估算神识，例如 `冥想条恢复97识 · 缓存3/100 · 估算100/100`。
- 目的：测试者复制状态时能看见“神识已满”来自冥想条恢复兜底，而不是误以为脚本忽略缓存神识。

v2.77.0 新增自动测试：

- `decideAfkNextAction` 覆盖 `postMeditationResume=true`、缓存神识仍低但 `canExplore=true` 时，返回 `startAutoExplore/post-meditation-ready`。
- `buildAfkPhaseStatus` 覆盖收功恢复窗口输出 `收功恢复窗口 · 剩余45秒 · 收功后将继续50倍探索`。
- `buildAfkStatusReport` 覆盖复制状态中的 `探索: 收功恢复窗口` 与 `恢复: 收功恢复窗口 ...`。
- 目的：成功收功后短时间内优先接上探索，避免缓存滞后导致脚本马上再次冥想。

v2.78.0 新增自动测试：

- `buildAfkDebugSnapshot` / `buildAfkDebugSummary` / `buildAfkStatusReport` 覆盖恢复窗口连续 `startAutoExplore/post-meditation-ready` 失败时输出专属建议。
- `buildAfkWaitingDiagnosis` 覆盖 `诊断归因: 收功后未能重启探索 · 自动探索启动失败 · ...`。
- 目的：收功恢复窗口如果没接上探索，测试者复制状态能直接看出失败入口，而不是只看到通用自动动作失败。

v2.79.0 新增自动测试：

- `decideAfkNextAction` 覆盖 `postMeditationResume=true`、缓存神识仍低、`canExplore=false` 且 `exploreDisabledReason` 为空时，仍返回 `startAutoExplore/post-meditation-ready`。
- 目的：成功收功后页面状态短暂滞后时，如果没有明确“神识不足/体力不足”原因，恢复窗口继续尝试接上自动探索，避免马上回冥想或长期等在 `explore-disabled`。

v2.80.0 新增自动测试：

- `isElementVisibleForAutomation` 覆盖 `hidden` class、`display:none`、`visibility:hidden`、`aria-hidden=true` 和正常可见元素。
- 目的：商人、遭遇、奇遇、陌生道友、冥想条等 blocker 判断不再只看 DOM 是否存在或是否缺少 `hidden` class，减少隐藏弹窗残留导致挂机误等。

v2.81.0 新增自动测试：

- `detectGuardianAutoHireInProgress` 覆盖真实遭遇文案 `自动雇护道第 1 次重试中，可手动接管`。
- `resolveEncounterGuardianAttempt` 覆盖 `guardianAutoHireInProgress=true` 时返回 `guardian-in-progress` 且不再次触发护道。
- 目的：低境界护道 1 倍模式遇到游戏内自动护道重试时，助手等待结算并报告状态，避免重复点击/重复扣费风险。

v2.82.0 新增自动测试：

- `decideAfkNextAction` 覆盖 `exploreMultiplier=50`、单次探索消耗 `10`、当前神识 `120` 时返回 `startMeditation/explore-batch-low-spirit`。
- `buildAfkStatusReport` 覆盖同一场景输出 `回冥想: 神识不足当前倍率 · 当前120/2758 · 单次10 · 50倍需500 · 阈值20`，并把阶段归类为 `needs-meditation`。
- 目的：富裕 50 倍模式按整组探索成本判断神识，避免只有够一次探索就反复尝试启动 50 倍批次。

浏览器验证：

- 使用 Agent Browser CLI 读真实 Edge 标签，不用论坛/聊天资料。
- 先只读状态和函数，不主动消耗资源。
- 资源动作只在用户明确试用或脚本配置开启后发生。
- v2.64.0 只读 Edge 证据：标签 `292345702` 仍加载 helper `2.58.0`，当前神识 `472/2758`、未冥想、未死亡、无游戏更新提示；测试新版前需重载本地扩展并刷新页面。
- v2.65.0 只读 Edge 证据：标签 `292345702` 仍加载 helper `2.58.0`，当前神识 `472/2758`、未冥想、未死亡、无游戏更新提示；测试新版前需重载本地扩展并刷新页面。
- v2.66.0 只读 Edge 证据：标签 `292345702` 仍加载 helper `2.58.0`，当前神识 `472/2758`、未冥想、未死亡、无游戏更新提示；测试新版前需重载本地扩展并刷新页面。
- v2.67.0 只读 Edge 证据：标签 `292345702` 仍加载 helper `2.58.0`，当前神识 `472/2758`、未冥想、未死亡、无游戏更新提示；测试新版前需重载本地扩展并刷新页面。
- v2.68.0 只读 Edge 证据：标签 `292345702` 仍加载 helper `2.58.0`，当前神识 `3/2756`、未冥想、未死亡、无游戏更新提示、无陌生道友弹窗；测试新版前需重载本地扩展并刷新页面。
- v2.69.0 只读 Edge 证据：标签 `292345702` 仍加载 helper `2.58.0`，当前神识 `3/2756`、未冥想、未死亡、无游戏更新提示、无奇遇/陌生道友弹窗；测试新版前需重载本地扩展并刷新页面。
- v2.70.0 只读 Edge 证据：标签 `292345702` 仍加载 helper `2.58.0`，当前神识 `3/2756`、未冥想、未死亡、无游戏更新提示、无商人/遭遇/战斗/奇遇/陌生道友/混天典狱；测试新版前需重载本地扩展并刷新页面。
- v2.71.0 只读 Edge 证据：标签 `292345702` 仍加载 helper `2.58.0`，页面尚无 `lingverseAutoMapExtensionVersion` / `lingverseAutoMapInjectedVersion` dataset，当前神识 `3/2756`、未冥想、未死亡、无游戏更新提示、无商人/遭遇/战斗/奇遇/陌生道友/混天典狱；测试新版前需重载本地扩展并刷新页面。
- v2.72.0 只读 Edge 证据：标签 `292345702` 仍加载 helper `2.58.0`，无 `LingVerseAutoMapInitializedVersion`，页面尚无扩展/注入版本 dataset，当前神识 `3/2756`、未冥想、未死亡、无游戏更新提示、无商人/遭遇/战斗/奇遇/陌生道友/混天典狱；测试新版前需重载本地扩展并刷新页面。
- v2.73.0 只读 Edge 证据：标签 `292345702` 仍加载旧 helper `2.58.0`，页面可见 `#meditationBar` 为“冥想修炼中 (最长12小时) / 1时30分 / 收功”，但 `_lastPlayerData.isMeditating=false`，当前神识 `3/2756`、单次消耗 `4`、倍率按钮 `×5`；本次未点击收功、探索、商人、护道、战斗、复活、用符、用丹、奇遇或道友按钮。
- v2.74.0 只读 Edge 证据：标签 `292345702` 仍加载旧 helper `2.58.0`，页面可见 `#meditationBar` “冥想修炼中 / 1时48分 / 收功”，`_lastPlayerData.isMeditating=false`，当前神识 `3/2756`、单次消耗 `4`、`canExplore=true`、倍率按钮 `×5`，无商人/遭遇/战斗/奇遇 blocker；本次未点击收功、探索、商人、护道、战斗、复活、用符、用丹、奇遇或道友按钮。
- v2.75.0 只读 Edge 证据：标签 `292345702` 仍加载旧 helper `2.58.0`，页面可见 `#meditationBar` “冥想修炼中 / 2时2分 / 恢复 ... 1234识 / 收功”，`_lastPlayerData.isMeditating=false`，当前缓存神识仍为 `3/2756`；本次未点击收功、探索、商人、护道、战斗、复活、用符、用丹、奇遇或道友按钮。
- v2.76.0 只读 Edge 证据：标签 `292345702` 仍加载旧 helper `2.58.0`，页面可见 `#meditationBar` “冥想修炼中 / 2时29分 / 恢复 ... 1505识 / 收功”，`_lastPlayerData.isMeditating=false`，缓存神识仍为 `3/2756`，无商人/遭遇/战斗/奇遇/陌生道友 blocker；本次未点击收功、探索、商人、护道、战斗、复活、用符、用丹、奇遇或道友按钮。
- v2.77.0 只读 Edge 证据：标签 `292345702` 仍加载旧 helper `2.58.0`，页面可见 `#meditationBar` “冥想修炼中 / 2时47分 / 恢复 ... 1691识 / 收功”，`_lastPlayerData.isMeditating=false`，缓存神识仍为 `3/2756`，无商人/遭遇/战斗/奇遇/陌生道友 blocker；本次未点击收功、探索、商人、护道、战斗、复活、用符、用丹、奇遇或道友按钮。
- v2.78.0 只读 Edge 证据：标签 `292345702` 仍加载旧 helper `2.58.0`，页面可见 `#meditationBar` “冥想修炼中 / 3时2分 / 恢复 ... 1843识 / 收功”，`_lastPlayerData.isMeditating=false`，缓存神识仍为 `3/2756`，无商人/遭遇/战斗/奇遇/陌生道友 blocker；本次未点击收功、探索、商人、护道、战斗、复活、用符、用丹、奇遇或道友按钮。
- v2.79.0 只读 Edge 证据：标签 `292345702` 仍加载旧 helper `2.58.0`，无扩展/注入/初始化新版 dataset；页面可见 `#meditationBar` “冥想修炼中 / 3时15分 / 恢复 ... 1882识 / 收功”，`_lastPlayerData.isMeditating=false`，缓存神识 `1896/2756`、`canExplore=true`，未死亡，无商人/遭遇/战斗/奇遇 blocker；本次未点击收功、探索、商人、护道、战斗、复活、用符、用丹、奇遇或道友按钮。
- v2.80.0 只读 Edge 证据：标签 `292345702` 仍加载旧 helper `2.58.0`；页面可见 `#meditationBar` “冥想修炼中 / 3时23分 / 恢复 ... 1882识 / 收功”，`_lastPlayerData.isMeditating=false`，缓存神识 `1696/2756`、`canExplore=true`，未死亡；玩家邂逅相关 modal selector 均不存在，无商人/遭遇/战斗/奇遇 blocker；本次未点击收功、探索、商人、护道、战斗、复活、用符、用丹、奇遇或道友按钮。
- v2.81.0 只读 Edge 证据：标签 `292345702` 仍加载旧 helper `2.58.0`；当前在北荒前哨遭遇 `北荒火鹰`，`#encounterOverlay` 可见，文本含 `自动雇护道第 1 次重试中，可手动接管`，`_encounterActive=true`，`_autoResumeExplorePending=true`，缓存神识 `1246/2756`、单次消耗 `10`、未死亡；商人/奇遇/符箓弹窗为隐藏 DOM；本次未点击收功、探索、商人、护道、战斗、复活、用符、用丹、奇遇或道友按钮。
- v2.82.0 只读 Edge 证据：标签 `292345702` 仍加载旧 helper `2.58.0`；当前位置北荒前哨，缓存神识 `926/2756`、单次消耗 `10`、`canExplore=true`、未冥想、未死亡、自动探索未运行；旧 helper 日志里有商人自动购买和“背包中没有藏宝图”历史记录。后续测试需重载本地扩展并刷新页面，v2.82.0 应在 50 倍配置下用 `10 × 50 = 500` 作为启动门槛。
- v2.76.0 本地验证目标：重载扩展并刷新页面后，复制状态在冥想条兜底激活时应出现 `冥想兜底:`，同时 `阶段:`/`冥想:` 仍显示神识已满或收功计划；本地自动测试只覆盖报告生成，不执行资源动作。
- v2.77.0 本地验证目标：成功收功后应进入 `收功恢复窗口`，在缓存神识短暂偏低但页面仍可探索时优先 `post-meditation-ready` 启动自动探索；如果页面明确不可探索，仍按原逻辑回冥想或等待。
- v2.78.0 本地验证目标：收功恢复窗口连续重启探索失败时，状态报告应出现 `诊断归因: 收功后未能重启探索 · 自动探索启动失败 · ...` 和专属建议。
- v2.79.0 本地验证目标：成功收功后的恢复窗口内，如果 `canExplore=false` 但页面没有给出神识不足/体力不足文案，下一步仍应是 `startAutoExplore/post-meditation-ready`；明确神识不足时仍应回冥想。
- v2.80.0 本地验证目标：隐藏 DOM 残留不会被识别为商人/遭遇/奇遇/陌生道友/冥想条 blocker；可见元素仍正常识别。
- v2.81.0 本地验证目标：遭遇文本显示游戏自动护道重试/处理中时，护道尝试 reason 应为 `guardian-in-progress`，状态报告应提示等待游戏护道结算，不触发新的护道入口。
- v2.82.0 本地验证目标：50 倍等高倍率模式必须先满足 `spiritCost * exploreMultiplier`；神识足够单次但不足整组时显示 `神识不足当前倍率` 并回冥想，状态报告写出例如 `50倍需500`。

## 下一步建议

1. 用户刷新页面/重载扩展后实测 v2.82.0：护道 1 倍预设重点观察“环境/阶段/模式/冥想/冥想兜底/冥想建议/恢复/回冥想/诊断/诊断归因/商人/商人建议/护道/护道建议/硬停/硬停建议”；如果页面可见冥想条但状态缓存不同步，复制状态里的“阶段/冥想”应仍显示已冥想时长，并在 140 分钟或缓存神识+冥想条恢复神识达到上限时触发“神识已满”收功，同时“冥想兜底”应显示恢复值、缓存值和估算值；成功收功后应出现“收功恢复窗口”，短时间内优先接上探索而不是马上又回冥想；收功恢复窗口内即使探索按钮短暂禁用，只要没有明确“神识不足/体力不足”，也应继续尝试 `post-meditation-ready`；隐藏在 DOM 里但 `display:none` / `visibility:hidden` / `aria-hidden` / 零尺寸的商人、遭遇、奇遇、陌生道友和冥想条不应误报阻塞；游戏遭遇面板显示“自动雇护道...重试中/处理中/可手动接管”时，状态应显示“护道: 游戏护道处理中”并等待结算；如果收功后没续上探索，`诊断归因:` 应显示“收功后未能重启探索 · 自动探索启动失败 · ...”；如果探索按钮禁用但状态没有写“神识不足”，只要神识低于阈值/单次消耗或不足当前倍率整组消耗，应显示回冥想而不是长期等待“当前区域不可探索”；`环境:` 如提示 helper/扩展版本不一致、helper/面板版本不一致或面板版本未知，先重载扩展并刷新页面；同一遭遇已尝试护道后卡住时 `诊断归因:` 应显示“本遭遇已尝试自动护道，避免重复扣费”；奇遇策略自动处理时状态应显示“奇遇动作:”和“奇遇建议:”，重复未推进时 `诊断归因:` 应显示“奇遇#... 自动选择第...项...后仍未前进”；陌生道友自动婉拒尝试后状态应显示“陌生道友:”和“陌生道友建议:”，未关闭时 `诊断归因:` 应显示“陌生道友自动婉拒后仍未关闭”；富裕 50 倍小号测试重点观察“模式/冥想/冥想兜底/冥想建议/商人/商人建议/探索启动/探索建议/用丹/用丹建议/用符/用符建议/符窗关闭/迎战/迎战建议/复活/复活建议/恢复/回冥想/诊断归因/预检”，确认同一遭遇不会重复触发迎战，符箓面板未关闭时不会继续自动迎战，手动/自动关窗后可恢复迎战判断，50 倍神识不足整组时状态显示 `50倍需...`；战斗/事件处理后没续上 50 倍探索时 `诊断归因:` 应显示“事件恢复后未能重启探索”或“复活恢复后未能重启探索”。
2. 继续用真实挂机摘要收集“自动探索停住”的事件原因，尤其记录 `automation.guardian` 的失败 message。
3. 富裕 50 倍模式继续小号测试：用符、复活、用丹都保持 opt-in，并先用默认本轮上限观察战斗结算后恢复窗口是否够用。
4. 用真实奇遇链继续记录每个 adventureId 的选项、奖励和后续步骤，并把摘要里的 `strategyHints.mapLine` 沉淀到策略表。
5. 继续收集真实摘要，用回放视图沉淀低境界护道失败、富裕战斗失败和未知奇遇策略。
