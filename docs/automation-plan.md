# 自动挂机实现计划

更新时间：2026-06-09

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

- `classifyExploreInterruption` 覆盖商人、陌生道友、奇遇链、混天典狱、天道禁闭、神识不足。
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

- `buildAfkDebugSnapshot` / `buildAfkDebugSummary` / `buildAfkStatusReport` 覆盖混天典狱和天道禁闭 hard-stop，状态报告无需等待重复诊断即可输出“硬停:”和“硬停建议:”。

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

v2.83.0 新增自动测试：

- `isMerchantAutomationContext` 覆盖手动状态返回 false，原生自动探索运行/恢复挂起/开关勾选返回 true。
- `isMerchantAutomationContext` 覆盖 `afkLoopEnabled=true` 时返回 true。
- 目的：云游商人仍不抢手动购物，但只要测试者已启动 AFK 循环，即使游戏原生 `_autoResumeExplorePending` 短暂缺失，也会继续自动购买最高价商品，减少挂机卡商人。

v2.84.0 新增自动测试：

- `merchant auto-only panel label mentions AFK loop context` 覆盖面板源码包含 `仅自动探索/挂机循环时处理`，且不再包含旧文案 `仅自动探索挂起时处理`。
- 目的：确保商人设置文案与 v2.83.0 的真实逻辑一致，测试者不会误以为 AFK 循环无法触发商人自动处理。

v2.85.0 新增自动测试：

- `buildAfkStatusReport explains meditation bar spirit fallback` 现在同时覆盖 `冥想同步: 玩家缓存未标记冥想 · 已按可见冥想条估算`。
- 目的：真实页可见冥想条但 `_lastPlayerData.isMeditating=false` 时，测试者复制状态能直接知道脚本采用冥想条兜底，不会误判为挂机未进入冥想。

v2.86.0 新增自动测试：

- `parseMeditationBarState reads visible meditation bar duration safely` 覆盖单行冥想条文本 `冥想修炼中 (最长12小时) 2时20分15秒 ... 收功`，解析 `durationSeconds=8415`，并继续解析 `recoveredSpirit`。
- 目的：当浏览器/页面把冥想条压成一行时，脚本仍能避开“最长12小时”上限文本，读取真实已冥想时长，保证自定义 140 分钟到点收功判断可靠。

v2.89.0 本地候选新增自动测试：

- `resolveExploreMultiplierSetting detects mismatched actual multiplier` 覆盖目标 50 倍、实际 1 倍时返回 `multiplier-mismatch`，目标/实际一致时返回 `multiplier-ready`，无法读取实际倍率时返回 `multiplier-read-failed`。
- `startAutoExplore verifies multiplier before using nirvana pills` 覆盖目标 50 倍但实际 1 倍时不会调用 `maybeUseNirvanaRebirthPill`，避免倍率未确认先消耗丹药。
- `startAutoExplore fails when page does not enter auto explore state` 覆盖页面 `toggleAutoExplore(true)` 被调用但 `_autoExploreRunning/_autoResumeExplorePending` 仍为 false 时记录 `start-failed`，避免入口静默拒绝却误报自动探索已启动。
- `handleEncounter waits instead of fighting when talisman dialog close fails` 覆盖同一轮里用符后 `dialogClosed=false` 时不会继续调用迎战，避免用符界面遮挡时误点对战。
- `resolveEncounterFightAttempt blocks auto fight when all selected talismans fail` 覆盖已选战斗符全部失败时阻断自动迎战；没有可用符或部分用符成功仍可继续后续迎战逻辑。
- `buildAfkStatusReport explains fight blocks after failed talisman use` 覆盖状态报告输出 `迎战: 战斗用符未成功`，并在建议里显示脱敏后的用符失败消息。
- `buildAfkStatusReport explains failed explore start attempts` 覆盖探索启动失败时输出 `50倍 · 实际1倍`。
- `AfkLoopManager.revive does not open resume window when death state remains active` 覆盖复活入口返回但页面仍死亡时记录 `revive-not-confirmed`，清空复活恢复窗口，并把入口调用计入本轮复活尝试。
- `buildAfkStatusReport explains unconfirmed revive attempts` 覆盖状态报告输出 `复活: 自动复活未确认` 和专属建议，失败消息继续脱敏。
- `buildAfkStatusReport keeps recent adventure samples after the popup closes` 覆盖当前无奇遇弹窗时，状态报告仍显示最近奇遇样本，并从样本生成 `456=1 / 456=2` 策略候选。
- 目的：富裕 50 倍模式启动前必须确认页面实际倍率已经切到 50；如果页面控件未切成功，脚本应停止启动自动探索并让测试者在复制状态里直接看到目标/实际倍率，同时不先消耗涅槃重生丹。启动入口返回后还要读页面运行标志，避免打坐、事件、商人、低神识等状态让自动探索静默未启动。
  同时，富裕遭遇链用符后如果符箓面板未关闭，必须停在用符/关窗阶段，等下一轮读取真实页面状态后再决定是否迎战；如果本次已选符箓全部使用失败，也暂停自动迎战并把失败消息写进报告。自动复活入口返回后还要确认死亡状态已经解除；未确认时不进入恢复窗口，避免战死后误接 50 倍探索或无限重复尝试。最近奇遇样本只写入 helper 本地诊断历史，不自动选择选项，不自动导入策略，方便众测反馈在弹窗关闭后仍能沉淀事件策略。

v2.90.0 本地候选新增自动测试：

- `buildAfkStatusReport surfaces recent logs when a wait diagnosis needs investigation` 覆盖等待诊断为 unknown/auto-action 时，可读状态报告追加 `现场日志:`，取最近一条脚本日志并沿用 URL query/hash 与 token/session 脱敏。
- 目的：真实长跑停在未知等待或自动动作反复未推进时，测试者只复制状态报告也能带出最后一条现场线索，减少“只知道卡住、不知道页面刚刚报了什么”的反馈噪音。该变更只读取已有日志摘要，不新增收功、探索、商人、护道、战斗、复活、用符、用丹、奇遇或道友按钮动作。

v2.91.0 本地候选新增自动测试：

- `buildAfkStatusReport explains stalled exploration meditation returns` 覆盖自动探索运行但判定卡住后回冥想时，可读状态报告输出 `回冥想: 自动探索疑似卡住 ... 卡住判定90秒`。
- 目的：测试者看到“探索不动就回冥想”时，能直接从复制状态确认触发的是卡住判定而不是低神识、页面不可探索或恢复窗口失败。该变更只增强报告文本，不新增收功、探索、商人、护道、战斗、复活、用符、用丹、奇遇或道友按钮动作。

v2.92.0 本地候选新增自动测试：

- `AfkLoopManager refreshes explore progress when recent game log changes` 覆盖自动探索运行中 `_autoExploreCount` 不变、但页面最新探索/收入/击败日志变化时，`lastExploreProgressAt` 会刷新，`exploreStalled` 保持 false。
- 目的：真实挂机日志还在产出收益或战斗结算时，不应因为页面计数未刷新就误判自动探索卡住并回冥想。该变更只读页面日志文本，不新增收功、探索、商人、护道、战斗、复活、用符、用丹、奇遇或道友按钮动作。

v2.93.0 本地候选新增自动测试：

- `buildAfkStatusReport treats stale extension dataset as loaded helper evidence` 覆盖 helper 顶层版本与面板初始化版本已经是新版、但 DOM dataset 里的扩展版本仍是旧版时，环境行显示 `页面已加载新版，扩展提示待下次重载统一`，不再提示“版本不一致，重载扩展并刷新页面”。
- 目的：真实 Edge 游戏页会出现 active helper 已经加载新版，而扩展/注入 dataset 仍滞后一版的状态；此时应告诉测试者当前页面核心脚本可用，避免反复打开扩展管理页。该变更只影响状态报告文案，不新增收功、探索、商人、护道、战斗、复活、用符、用丹、奇遇或道友按钮动作。

v2.94.0 本地候选新增自动测试：

- `decideAfkNextAction handles adventure only when fixed adventure mode is enabled` 增补覆盖：`adventureMode=pause` 且 `adventureComplete=true`、`autoCloseCompletedAdventure=true` 时返回 `handleAdventure/adventure-close-completed`；未完成奇遇仍等待；显式关闭该开关时也等待。
- `buildAfkStatusReport surfaces completed adventure close attempts in pause mode` 覆盖暂停模式下已完成奇遇自动收尾的状态报告，输出 `奇遇动作: 准备关闭奇遇` 和 `奇遇建议: 奇遇已完成 · 将只关闭/完成当前奇遇，不自动选择新剧情`。
- 目的：测试者默认暂停奇遇以避免错选剧情，但奇遇链已经完成、只剩结束/关闭按钮时，继续卡住挂机没有价值。本版新增 `autoCloseCompletedAdventure`，默认开启，仅在快照明确 `adventureComplete=true` 时自动关闭完成奇遇并进入事件恢复窗口；仍不会在 pause 模式点击任何剧情选项。该变更不新增收功、探索、商人、护道、战斗、复活、用符、用丹或未完成奇遇选项动作。

v2.95.0 本地候选新增自动测试：

- `handleAdventure does not repeat the same adventure choice while the step is unchanged` 覆盖策略模式命中 `456=2` 时首次点击第 2 项，同一个 `adventureId + step + totalSteps + choiceIndex` 第二次进入不会重复点击；步骤推进到下一步后重新允许点击策略项。
- `buildAfkStatusReport explains repeated adventure choice suppression` 覆盖状态报告输出 `奇遇动作: 本步已触发自动选择` 和 `奇遇建议: 本奇遇步骤已触发过自动选择 · 暂停重复点击，等待页面推进或手动处理后复制摘要`。
- 目的：奇遇策略自动选择是 opt-in，但真实页面可能因为网络、动画、弹窗遮挡或游戏状态未推进而停在同一步。v2.95.0 用同一步同一选项去重保护，把重复执行改成等待和报告，避免连续点击同一个剧情选项；页面推进到下一步或奇遇关闭后会清除本地去重键。该变更不新增收功、探索、商人、护道、战斗、复活、用符、用丹、已完成奇遇关闭或陌生道友动作。

v2.96.0 本地候选新增自动测试：

- `AfkLoopManager refreshes player info instead of trusting stale cache` 覆盖 `_lastPlayerData.spirit=467` 但 `/api/player/info` 返回 `spirit=7` 时，`buildSnapshot` 会读取玩家信息接口并使用新鲜神识 `7`。
- 目的：真实 Edge 当前已经出现神识只剩 `7/2756` 的挂机临界状态；AFK 决策如果只信旧缓存，可能错过“神识<20/不足单次探索/不足整组倍率”而继续等待或尝试探索。本版让每轮 AFK 快照先刷新玩家信息，成功后同步 `_lastPlayerData`，失败才回退旧缓存。该变更只增加只读玩家信息 GET，不新增收功、探索、商人、护道、战斗、复活、用符、用丹、奇遇或陌生道友按钮动作。

v2.97.0 本地候选新增自动测试：

- `resolveEncounterGuardianAttempt marks completed guardian attempts per encounter` 增补覆盖 `autoHireGuardian=true` 且 `exploreMultiplier=50` 时返回 `guardian-batch-explore-unavailable`，不会尝试触发护道入口。
- `buildAfkRiskStatus summarizes high-risk AFK switches` 增补覆盖自动护道搭配批量探索时风险预检输出“批量探索遭遇不能雇护道，自动护道仅建议用于1倍探索”。
- 目的：游戏说明确认批量探索遭遇不能请护道者，因此“护道 1 倍”和“富裕 50 倍”应保持为两个不同模式。v2.97.0 防止测试者手动组合出无效配置后误以为脚本会在 50 倍遭遇里雇护道；该变更只跳过 AFK 护道入口并增强报告，不新增探索、迎战、复活、用符、用丹、商人、奇遇或陌生道友动作。

v2.98.0 本地候选新增自动测试：

- `readAfkResourceDomFallback parses visible spirit and explore cost without actions` 覆盖 `#statSpirit` 文本 `7 / 2,756` 和 `#exploreBtn` 文本 `探索(-10神识)` 的只读解析，同时确认 `--` 不会被误读成神识。
- `AfkLoopManager falls back to visible resource DOM when player data is unavailable` 覆盖接口不可用且 `_lastPlayerData` 缺失时，`buildSnapshot` 可从可见 DOM 补齐 `spirit/maxSpirit/spiritCost`。
- 目的：真实 Edge 刚加载页时 `_lastPlayerData` 可能为 null、状态栏仍是 `--`，但探索按钮已经有单次神识消耗。v2.98.0 让 AFK 快照在接口/cache 缺失时使用页面只读兜底，避免缺少资源字段导致挂机判断空转；该变更不新增收功、探索、商人、护道、战斗、复活、用符、用丹、奇遇或陌生道友动作。

v2.99.0 本地候选新增自动测试：

- `buildAfkStatusReport forecasts meditation spirit recovery from the visible bar` 覆盖冥想条已恢复 `600识`、已冥想 1 小时、计划 140 分钟时，状态报告输出 `冥想预计: 已恢复600识 · 当前估算700/2000 · 计划收功约1500/2000`。
- `selectMerchantItem uses array position when merchant items omit index` 覆盖云游商人商品接口只返回数组顺序、未返回 `index` 字段时，最高价商品会补 `index=数组位置`，确保购买入口仍能收到有效 index。
- 目的：测试者需要判断“冥想 2小时20分钟”是否刚好、过短或浪费。v2.99.0 只在状态报告里用冥想条恢复量和已冥想时长估算当前/计划收功神识，不改变收功条件或任何资源动作。
- 目的：云游商人自动处理的真实购买接口要求 `{ index }`，如果商品数据只保留数组顺序，脚本不能把最高价商品识别出来却传空 index；该变更只修正自动商人购买参数，不改变只在自动探索/挂机上下文处理的安全边界。

v2.100.0 本地候选新增自动测试：

- `buildAfkStatusReport explains exploration capacity for the configured multiplier` 覆盖当前神识 `120`、单次消耗 `10`、配置 `50` 倍时，状态报告输出 `探索续航: 当前120识 · 50倍需500识/组 · 可跑0组 · 约12次1倍探索 · 不足当前倍率`。
- `buildAfkStatusReport estimates exploration capacity while meditating` 覆盖冥想中有恢复神识和计划时长时，`探索续航:` 使用当前估算神识，并显示计划收功后约可跑几组当前倍率探索。
- `AfkLoopManager ignores non-log page text when checking explore progress` 覆盖自动探索运行时，真实游戏日志未变化但页面其他区域含 `探索/收入` 文本，不会刷新探索进度时间。
- 目的：测试者需要在不触发探索的情况下判断“当前神识到底能不能跑当前倍率”。v2.100.0 只在复制状态里追加报告-only 的 `探索续航:` 行，解释当前神识、当前倍率整组消耗、可跑组数、折算 1 倍次数，以及冥想计划收功后的估算组数；该报告不改变收功、探索、商人购买、护道、战斗、复活、用符、用丹、奇遇或陌生道友动作。
- 目的：真实页面可能同时显示聊天、说明和隐藏面板，不能让非游戏日志里的“探索/收入/击败”文字误刷新自动探索进度。v2.100.0 将自动探索进展签名来源优先收窄到 `#logContent` / `.log-content` / `#logPanel` / `.log-area`，只有找不到日志容器时才回退 body，减少长跑时该回冥想却继续等待的情况。

v2.101.0 本地候选新增自动测试：

- `heavenly ban is treated as a manual hard stop` 覆盖游戏探索接口 `code=430` / 页面文本 `天道禁闭` 的归类、挂机决策和状态报告：下一步应等待 `heavenly-ban`，报告输出 `硬停: 天道禁闭 · 脚本暂停自动探索` 和 `硬停建议: 天道禁闭需要手动解除或等待 · 脚本不会自动跳过、自动点击或消耗资源`。
- 目的：游戏源码里 `res.code === 430` 会以“天道禁闭”停止自动探索。该状态不能由外部脚本安全自动解除，所以 v2.101.0 只做只读检测、摘要字段和硬停报告，避免测试者把它误判成商人/神识/恢复窗口故障；不新增收功、探索、商人购买、护道、战斗、复活、用符、用丹、奇遇、陌生道友或解除禁闭动作。

v2.102.0 本地候选新增自动测试：

- `MerchantAutoBuyer refreshes page state after page-function purchases` 覆盖通过页面函数 `buyMerchantItem(index)` 触发云游商人购买后，也会调用 `clearMerchantState({ clearItems: true, resume: true })`、刷新日志/玩家信息并尝试恢复自动探索，与 API 购买路径保持一致。
- `buildAfkStatusReport diagnoses merchant windows that remain after purchase is triggered` 覆盖连续等待 `merchant-active` 且最近商人尝试为 `purchase-triggered` 时，状态报告输出 `诊断归因: 云游商人购买已触发但窗口仍未关闭，等待游戏关闭商人并恢复探索`。
- 目的：真实挂机里商人是高频中断点，最高价购买触发后还需要确认商人窗口能离开并恢复自动探索。v2.102.0 不增加额外购买次数，只把页面函数购买后的收尾兜底补齐，并在购买已触发但仍卡商人时给出明确归因，减少测试者误判为神识、天道禁闭或恢复窗口问题。

v2.103.0 本地候选新增自动测试：

- `MerchantAutoBuyer opens the AFK interaction resume window after purchases` 覆盖商人购买触发成功后，AFK manager 会打开 `postInteractionResumeUntil` 恢复窗口并清空 `lastDecisionKey`，让下一轮能按已有事件恢复逻辑接回自动探索。
- 目的：v2.102.0 已统一商人购买后的页面清理和游戏原生恢复调用；v2.103.0 再把商人购买成功接入 AFK 自己的事件恢复窗口，避免原生 `_autoResumeExplorePending` 丢失或玩家信息短暂滞后时，买完商人后没有像战斗/奇遇/护道那样立刻进入恢复探索链路。该变更不增加额外购买次数，不新增收功、探索启动、护道、战斗、复活、用符、用丹、奇遇或陌生道友动作；是否真正启动探索仍由下一轮 `decideAfkNextAction` 按神识、倍率、阻塞和配置判断。

v2.104.0 本地候选新增自动测试：

- `AfkLoopManager schedules post-interaction ticks only while AFK is enabled` 覆盖事件恢复窗口仍会记录 `postInteractionResumeUntil`、刷新游戏数据并清空 `lastDecisionKey`，但只有传入的 AFK 配置 `enabled=true` 时才安排下一轮 `tick(true)`。
- 目的：战斗迎战、自动护道、奇遇处理、陌生道友婉拒和商人购买都在用同一类事件恢复窗口。v2.104.0 把恢复窗口调度收敛到 `schedulePostInteractionResume` / `openPostInteractionResumeWindow` 的统一规则，避免 AFK 关闭、手动调试或纯测试钩子调用时后台自己推进下一轮；该变更不增加新的收功、探索启动、商人购买、护道、战斗、复活、用符、用丹、奇遇或陌生道友动作。

v2.105.0 本地候选新增自动测试：

- `mergeAdventureStrategyImport accepts readable status strategy lines` 覆盖测试者只粘贴可读状态文本时，导入策略也能从 `奇遇策略: 456=2 / 789=1` 和 `奇遇动作: ... #888 · 第3项...` 中提取策略；同时不会把 `奇遇: #999 第1/3步` 这类步骤描述误当作选项。
- 目的：真实众测反馈不一定只发 JSON 摘要，常常会发可读状态报告或只复制几行中文。v2.105.0 让策略导入更宽松，减少手工整理 `adventureChoiceMap` 的成本；导入仍会关闭挂机启动状态，只更新本地配置，不触发探索、商人购买、护道、战斗、复活、用符、用丹、奇遇或陌生道友动作。

v2.106.0 本地候选新增自动测试：

- `extractMerchantItemsFromDom reads visible merchant cards with prices and indexes` 覆盖可见商人弹窗里只有 DOM 商品卡片时，也能解析商品名、价格和购买 index；支持 `data-merchant-index` 和按钮 `buyMerchantItem(index)` 兜底。
- `MerchantAutoBuyer buys highest priced DOM fallback item when API has no merchant items` 覆盖 `/api/game/merchant` 返回空商品时，自动商人会从可见弹窗 DOM 读取商品并继续按最高价购买。
- 目的：真实挂机里云游商人是高频中断点，若接口短暂空、页面变量滞后或商品已经渲染但接口没有 items，旧逻辑会停在“没有商品”。v2.106.0 增加页面弹窗只读兜底，仍然遵守自动探索/挂机循环上下文和同一商人 key 去重，不扩大手动购物场景。

v2.107.0 本地候选新增自动测试：

- `MerchantAutoBuyer leaves merchant when confirmed no purchasable items remain` 覆盖 API 成功确认空商品、DOM 也没有可买商品时，自动商人会调用 `/api/game/merchant/leave`，清理商人窗口并恢复自动探索/AFK 事件恢复窗口。
- `MerchantAutoBuyer does not leave merchant on uncertain API read failures` 覆盖商人 API 读取异常时只记录 `read-failed`，不会强退商人，避免临时读取失败时错过商品。
- 目的：云游商人即使没有商品也会挡住自动探索，v2.107.0 把“已确认没有可买商品”变成可配置自动离开；不确定的读取失败仍保守等待和报告。

v2.108.0 本地候选新增自动测试：

- `MerchantAutoBuyer leaves a still-active merchant after purchase was triggered` 覆盖最高价购买已触发、同一个商人窗口仍然活跃且商品 key 未变化时，自动商人不再重复购买，而是调用 `/api/game/merchant/leave` 清理残留窗口并恢复挂机。
- `MerchantAutoBuyer does not leave a stuck post-purchase merchant when disabled` 覆盖测试者关闭“购买后窗口未关闭时自动离开”后，同样的购买后残留窗口只等待和报告，不主动离开。
- `buildAfkStatusReport explains merchant leave after stuck purchases` 覆盖状态报告能区分“无商品离开”和“购买后窗口未关闭离开”，避免众测反馈只看到英文内部原因。
- 目的：真实挂机里最高价购买请求可能已经触发，但商人弹窗或 `_merchantActive` 没有及时清掉，旧逻辑会因同一 merchant key 去重而长期等待。v2.108.0 把这个卡点变成可配置收尾动作，仍只在最近一次尝试为 `purchase-triggered` 时触发，不覆盖购买失败、读取失败或手动购物场景。

v2.109.0 本地候选新增自动测试：

- `AFK config packs export normalized settings and import safely` 扩展覆盖配置包中的 `merchant` 字段：自动商人开关、仅自动探索/挂机循环处理、购买延迟、无商品离开、购买后残留窗口离开都会随配置包导出/导入。
- 目的：众测配置包此前只携带 AFK 循环和护道设置，商人策略会留在本机旧值，导致“同一个配置包”在不同测试者机器上商人行为不一致。v2.109.0 让配置包完整固定自动商人策略，同时旧配置包缺少 `merchant` 字段时仍兼容当前本地设置。

v2.110.0 本地候选新增自动测试：

- `applyAfkAutomationPreset includes safe merchant automation defaults` 覆盖稳妥、护道和富裕预设会一并输出自动商人配置：开启最高价购买、仅自动探索/挂机循环处理、购买延迟 800ms、无商品自动离开、购买后窗口未关闭自动离开。
- 目的：众测者常用预设按钮开始测试；如果预设只更新 AFK 循环，自动商人仍可能继承本机旧值，导致同一预设在不同浏览器中行为不同。v2.110.0 把“挂机模式预设”和“自动商人安全策略”绑定为同一个可复现测试入口。

v2.111.0 本地候选新增自动测试：

- `buildAfkPresetStatus includes merchant preset drift in status reports` 覆盖 AFK 循环已匹配富裕 50 倍、但自动商人关闭时，预设状态不再显示已匹配，而是输出 `自动商人应开启`；调试摘要会保留当前 `config.merchant`，可读状态报告的 `模式:` 行同步显示该漂移。
- 目的：预设现在包含商人安全策略，状态报告也必须把商人开关/延迟/离开策略纳入“是否匹配预设”的判断，减少多人测试时“模式一样但商人行为不同”的反馈噪音。

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
- v2.83.0 只读 Edge 证据：标签 `292345702` 仍加载旧 helper `2.58.0`；当前缓存神识 `6/2756`、单次消耗 `10`、`canExplore=true`、未冥想、未死亡、自动探索未运行；隐藏 DOM 仍残留冥想条、遭遇和商人文本，旧日志包含多次商人自动购买记录。本次未点击收功、探索、商人、护道、战斗、复活、用符、用丹、奇遇或道友按钮；后续测试需重载本地扩展并刷新页面。
- v2.89.0 只读 Edge 证据：真实 Edge 的 LingVerse unpacked 扩展 ID 为 `pnighlpbfnpjofjglooiallkccdhahec`，路径指向 `\\wsl.localhost\\Ubuntu-22.04\\home\\lxh\\LingVerse-all`；通过 Edge 扩展页 UIA 精准执行该扩展的“重新加载”后，扩展页显示版本 `2.89.0`。刷新真实标签 `292345702` 后，helper/扩展/注入/面板初始化版本均为 `2.89.0`；页面更新提示消失，实际探索倍率 `1`，缓存神识 `840/2756`，未死亡、AFK 关闭、自动探索未运行、无商人/遭遇/奇遇/符箓弹窗。本次只重载扩展并刷新页面以加载脚本，未点击收功、探索、商人、护道、战斗、复活、用符、用丹、奇遇或道友按钮；可直接在 Edge 面板按配置小步试用 v2.89.0。
- v2.90.0 只读 Edge 证据：Agent Browser Bridge profile 已标记为 `edge-personal-lingverse`，游戏标签 `292345702` 在该个人 Edge profile 下。发现页面 helper/初始化版本为 `2.90.0` 但扩展/注入 dataset 仍为 `2.89.0` 后，通过个人 profile 的 Edge 扩展页 UIA 调用 LingVerse unpacked 扩展“重新加载”，再刷新游戏标签；最终 helper/扩展/注入/面板初始化版本均为 `2.90.0`，AFK 关闭、自动探索未运行，页面无商人/遭遇/奇遇/符箓文本。本次只重载扩展并刷新页面以加载脚本，未点击收功、探索、商人、护道、战斗、复活、用符、用丹、奇遇或道友按钮。
- v2.91.0 只读 Edge 证据：Agent Browser Bridge profile 继续使用 `edge-personal-lingverse`，扩展重载后当前有效游戏标签为 `292345957`（旧 `292345702` 已断开）。真实页 helper/扩展/注入/面板初始化版本均为 `2.91.0`，AFK 关闭、自动探索未运行，页面能看到“启动挂机/停止挂机”和云游商人自动购买配置；控制台 error 列表为空。本次只读取页面状态、快照和控制台错误，未点击收功、探索、商人、护道、战斗、复活、用符、用丹、奇遇或道友按钮。
- v2.92.0 只读 Edge 游戏页证据：按用户指示只接管 `https://ling.muge.info/game.html`，真实 Edge 标签仍为 `292345957`。游戏页实际 helper/面板初始化版本均为 `2.92.0`，`getExploreProgressLogSignature` 测试钩子存在，并能从页面文本提取 `击败北荒火鹰 / 保底获得 / 探索(-10神识)` 进展签名；AFK 关闭、自动探索未运行、自动恢复挂起为 false。扩展/注入 dataset 仍显示 `2.91.0`，说明扩展 loader 版本提示待下次重载统一，但当前游戏页核心 helper 代码已是 `2.92.0`。本次只读取游戏页状态和快照，未点击收功、探索、商人、护道、战斗、复活、用符、用丹、奇遇或道友按钮。
- v2.93.0 只读 Edge 游戏页证据：按用户指示仍只接管标签 `292345957` 的 `https://ling.muge.info/game.html`，不进入扩展管理页。刷新该游戏页后，helper/面板初始化版本均为 `2.93.0`，扩展/注入 dataset 仍显示 `2.91.0`，状态报告环境行已变为 `环境: helper 2.93.0 · 扩展提示 2.91.0 · 页面已加载新版，扩展提示待下次重载统一`；AFK 关闭、自动探索未运行、自动恢复挂起 false，缓存神识 `627/2756`、单次消耗 `10`、可探索、未死亡、未冥想。本次只刷新游戏页和读取状态，未点击收功、探索、商人、护道、战斗、复活、用符、用丹、奇遇或道友按钮。
- v2.94.0 只读 Edge 游戏页证据：仍只接管标签 `292345957` 的 `https://ling.muge.info/game.html`。刷新游戏页后，helper/面板初始化版本均为 `2.94.0`，扩展/注入 dataset 仍显示 `2.91.0`；`normalizeAfkLoopConfig({}).autoCloseCompletedAdventure=true`，模拟已完成奇遇返回 `handleAdventure/adventure-close-completed`，模拟未完成奇遇仍返回 `wait/adventure-active`；状态报告输出 `奇遇动作: 准备关闭奇遇 · #456` 和“不自动选择新剧情”。AFK 关闭、自动探索未运行、自动恢复挂起 false，缓存神识 `627/2756`、单次消耗 `10`、可探索、未死亡、未冥想。本次只刷新游戏页和读取测试钩子，未点击收功、探索、商人、护道、战斗、复活、用符、用丹、奇遇或道友按钮。
- v2.95.0 只读 Edge 游戏页证据：仍只接管标签 `292345957` 的 `https://ling.muge.info/game.html`。确认 AFK 关闭、自动探索未运行、自动恢复挂起 false 后刷新该游戏页；刷新后 helper/面板初始化/测试钩子版本均为 `2.95.0`，扩展/注入 dataset 仍显示 `2.91.0`。通过测试钩子构造重复奇遇选择摘要，状态报告输出 `奇遇动作: 本步已触发自动选择 · #456 · 第2项「绕路离开」 · 选项按钮` 和 `奇遇建议: 本奇遇步骤已触发过自动选择 · 暂停重复点击，等待页面推进或手动处理后复制摘要`。刷新后 AFK 关闭、自动探索未运行、自动恢复挂起 false，缓存神识 `467/2756`、单次消耗 `10`、可探索、未死亡、未冥想、无遭遇和当前奇遇 step、无游戏更新提示。本次只刷新游戏页和读取/模拟测试钩子，未点击收功、探索、商人、护道、战斗、复活、用符、用丹、奇遇或道友按钮。
- v2.96.0 只读 Edge 开发前证据：仍只接管标签 `292345957` 的 `https://ling.muge.info/game.html`。真实页 helper `2.95.0`，AFK 关闭、自动探索未运行、自动恢复挂起 false；玩家状态和可见状态栏均显示神识 `7/2756`、单次消耗 `10`、可探索、未死亡、未冥想。该观察说明低神识临界状态需要快照读取新鲜玩家信息，避免旧缓存影响是否回冥想。本次只读取 DOM/测试钩子/玩家缓存，未点击收功、探索、商人、护道、战斗、复活、用符、用丹、奇遇或道友按钮。
- v2.96.0 只读 Edge 游戏页证据：仍只接管标签 `292345957` 的 `https://ling.muge.info/game.html`，不进入扩展管理页。确认 AFK 关闭、自动探索未运行、自动恢复挂起 false 后刷新游戏页；helper/面板初始化/测试钩子版本均为 `2.96.0`。用独立临时 manager 把 `_lastPlayerData.spirit` 模拟成 `467` 后调用 `buildSnapshot`，快照仍通过只读玩家信息接口得到 `snapshotSpirit=7`、单次消耗 `10`，`decideAfkNextAction` 返回 `startMeditation/spirit-below-threshold`，并把缓存恢复到 `7`。本次只刷新游戏页、读取玩家信息和临时模拟测试钩子，未点击收功、探索、商人、护道、战斗、复活、用符、用丹、奇遇或道友按钮。
- v2.97.0 只读 Edge 游戏页证据：仍接管真实 Edge profile `edge-personal-lingverse`，通过 UIA 精准调用 LingVerse unpacked 扩展 `pnighlpbfnpjofjglooiallkccdhahec` 的“重新加载”，扩展页显示版本 `2.97.0`；刷新游戏标签 `292345957` 后，helper/initialized/extension/injected 均为 `2.97.0`，AFK 关闭、自动探索未运行。测试钩子模拟 `autoHireGuardian=true` + `exploreMultiplier=50`，风险预检警告 `批量探索遭遇不能雇护道，自动护道仅建议用于1倍探索`，护道决策返回 `guardian-batch-explore-unavailable`。本次只重载扩展、刷新页面和读取测试钩子，未点击收功、探索、商人、护道、战斗、复活、用符、用丹、奇遇或道友按钮。
- v2.98.0 只读 Edge 开发前证据：仍接管真实 Edge profile `edge-personal-lingverse` 的游戏标签 `292345957`。页面 helper/initialized/extension/injected 均为 `2.97.0`，AFK 关闭、自动探索未运行、自动恢复挂起 false；`_lastPlayerData=null`，`#statSpirit=--`，但探索按钮显示 `探索(-1神识)`。该观察只读取页面状态和 DOM 文本，未点击收功、探索、商人、护道、战斗、复活、用符、用丹、奇遇或道友按钮。
- v2.98.0 只读 Edge 游戏页证据：同步 main repo、standalone helper 和 Windows 扩展目录后，通过真实 Edge 扩展页 UIA 调用 LingVerse unpacked 扩展“重新加载”，刷新游戏标签 `292345957`。helper/initialized/extension/injected 均为 `2.98.0`；新增 DOM 兜底 hook 从页面读到神识 `144/2756`、单次消耗 `10`，`buildSnapshot` 返回相同 `spirit/maxSpirit/spiritCost`；AFK 关闭、自动探索未运行、无商人/遭遇/奇遇 blocker。本次只重载扩展、刷新页面、读取 DOM/接口/测试钩子，未点击收功、探索、商人、护道、战斗、复活、用符、用丹、奇遇或道友按钮。
- v2.99.0 只读 Edge 开发前证据：仍接管真实 Edge profile `edge-personal-lingverse` 的游戏标签 `292345957`。当前页面 helper/initialized/extension/injected 均为 `2.98.0`，AFK 关闭、自动探索未运行；玩家处于冥想中，神识 `144/2756`，单次消耗 `10`，冥想条显示 `1时17分`、恢复 `710识`。旧状态报告只显示 `阶段: 冥想中 · 已冥想1小时18分钟 · 计划剩余1小时2分钟 · 满神识提前结束`，没有显示预计收功神识。本次只读取 DOM/接口/测试钩子，未点击收功、探索、商人、护道、战斗、复活、用符、用丹、奇遇或道友按钮。
- v2.99.0 只读 Edge 游戏页证据：同步 main repo、standalone helper 和 Windows 扩展目录后，使用 Windows UIAutomation 打开真实 Edge 用户配置 3 的 `edge://extensions/`，精准调用 LingVerse unpacked 扩展 `pnighlpbfnpjofjglooiallkccdhahec` 的“重新加载”；扩展卡片回读版本 `2.99.0`。刷新游戏标签 `292345957` 后，helper/initialized/extension/injected/test hook 均为 `2.99.0`；AFK 关闭、自动探索未运行、商人未激活，玩家冥想中，神识 `281/2756`、冥想条恢复 `954识`，状态报告输出 `冥想预计: 已恢复954识 · 当前估算1235/2756 · 计划收功约1563/2756`；测试钩子模拟商人商品缺 `index` 时，最高价商品补为 `index: 1`。本次只重载扩展、刷新页面、读取 DOM/接口/测试钩子和纯函数模拟，未点击收功、探索、商人购买、护道、战斗、复活、用符、用丹、奇遇或道友按钮。
- v2.100.0 只读 Edge 游戏页证据：同步 main repo、standalone helper 和 Windows 扩展目录后，真实 Edge 用户配置 3 的扩展卡片仍显示 `2.99.0`，但 Windows 侧直接读取 `\\wsl.localhost\\Ubuntu-22.04\\home\\lxh\\LingVerse-all\\manifest.json` 和 helper 文件均为 `2.100.0`；刷新游戏标签 `292345957` 后，页面 helper/initialized/test hook 为 `2.100.0`，extension/injected dataset 仍为 `2.99.0`，状态报告环境行显示 `页面已加载新版，扩展提示待下次重载统一`。测试钩子确认商人最高价缺 index 兜底返回 `index:1`，日志进度读取来自游戏日志容器；当前 DOM 兜底神识 `281/2756`、单次消耗 `10`，50 倍探索续航输出 `当前281识 · 50倍需500识/组 · 可跑0组 · 约28次1倍探索 · 不足当前倍率`，冥想模拟输出当前估算和计划收功组数。本次只刷新页面、重载/读取扩展页、读取 DOM/接口/测试钩子和纯函数模拟，未点击收功、探索、商人购买、护道、战斗、复活、用符、用丹、奇遇或道友按钮。
- v2.102.0 只读 Edge 游戏页证据：使用 Agent Browser CLI 接管真实 Edge profile `edge-personal-lingverse` 的游戏标签 `292345957`。刷新前 helper/initialized 为 `2.100.0`，AFK 关闭、自动探索未运行、自动恢复挂起 false、商人未激活；刷新游戏页后 helper/initialized 为 `2.102.0`，extension/injected dataset 仍显示 `2.99.0`，`LingVerseAutoMapTestHooks.MerchantAutoBuyer` 存在。纯函数模拟商人 `purchase-triggered` 后持续 `merchant-active`，状态报告输出 `商人: 已触发购买最高价商品 · 传说归识丹 · 9999灵石 · 页面函数` 和 `诊断归因: 云游商人购买已触发但窗口仍未关闭，等待游戏关闭商人并恢复探索`；控制台 error 列表为空。本次只刷新页面和读取/模拟测试钩子，未点击收功、探索、商人购买、护道、战斗、复活、用符、用丹、奇遇或道友按钮。
- v2.104.0 只读 Edge 游戏页证据：使用 Agent Browser CLI 接管真实 Edge profile `edge-personal-lingverse` 的游戏标签 `292345957`。开发同步后先读到页面仍是 helper/initialized `2.102.0`、AFK 关闭、自动探索未运行、自动恢复挂起 false、商人未激活；在该安全状态下刷新游戏页，随后读回 helper/initialized `2.104.0`，extension/injected dataset 仍为 `2.99.0`，AFK 关闭、自动探索未运行、自动恢复挂起 false、商人未激活；控制台 error 列表为空。本次只刷新游戏页和读取页面变量/控制台，未点击收功、探索、商人购买、护道、战斗、复活、用符、用丹、奇遇或道友按钮。
- v2.76.0 本地验证目标：重载扩展并刷新页面后，复制状态在冥想条兜底激活时应出现 `冥想兜底:`，同时 `阶段:`/`冥想:` 仍显示神识已满或收功计划；本地自动测试只覆盖报告生成，不执行资源动作。
- v2.77.0 本地验证目标：成功收功后应进入 `收功恢复窗口`，在缓存神识短暂偏低但页面仍可探索时优先 `post-meditation-ready` 启动自动探索；如果页面明确不可探索，仍按原逻辑回冥想或等待。
- v2.78.0 本地验证目标：收功恢复窗口连续重启探索失败时，状态报告应出现 `诊断归因: 收功后未能重启探索 · 自动探索启动失败 · ...` 和专属建议。
- v2.79.0 本地验证目标：成功收功后的恢复窗口内，如果 `canExplore=false` 但页面没有给出神识不足/体力不足文案，下一步仍应是 `startAutoExplore/post-meditation-ready`；明确神识不足时仍应回冥想。
- v2.80.0 本地验证目标：隐藏 DOM 残留不会被识别为商人/遭遇/奇遇/陌生道友/冥想条 blocker；可见元素仍正常识别。
- v2.81.0 本地验证目标：遭遇文本显示游戏自动护道重试/处理中时，护道尝试 reason 应为 `guardian-in-progress`，状态报告应提示等待游戏护道结算，不触发新的护道入口。
- v2.82.0 本地验证目标：50 倍等高倍率模式必须先满足 `spiritCost * exploreMultiplier`；神识足够单次但不足整组时显示 `神识不足当前倍率` 并回冥想，状态报告写出例如 `50倍需500`。
- v2.83.0 本地验证目标：商人“只在自动探索时处理”应把 AFK 循环运行视为自动化上下文；未启动挂机且没有自动探索运行/挂起/开关勾选时仍不处理手动商人。
- v2.84.0 本地验证目标：自动商人设置面板显示“仅自动探索/挂机循环时处理”，与实际 AFK 循环上下文逻辑一致。
- v2.85.0 本地验证目标：冥想条可见但玩家缓存未同步时，复制状态同时显示 `冥想兜底:` 与 `冥想同步:`。
- v2.86.0 本地验证目标：冥想条单行文本仍能解析真实已冥想时长，140 分钟到点收功不被“最长12小时”干扰。
- v2.91.0 本地验证目标：富裕模式设置 50 倍后必须读回实际倍率；目标/实际不一致时不启动自动探索，状态报告显示 `实际...倍`；调用自动探索入口后如果页面运行标志仍未开启，也记录启动失败；用符后符箓面板未关闭时，同一轮不会继续自动迎战；已选符箓全部失败时暂停迎战并显示脱敏失败消息；自动复活入口返回后如果页面仍显示死亡，状态报告应显示 `自动复活未确认`，不打开复活恢复窗口；奇遇弹窗关闭后，复制状态仍可显示最近奇遇样本和可导入策略候选；未知等待或自动动作反复未推进时，状态报告应出现脱敏 `现场日志:`；探索疑似卡住回冥想时，状态报告应显示 `卡住判定...秒`。
- v2.92.0 本地验证目标：自动探索运行或恢复挂起时，页面最新探索/收入/击败日志变化应刷新进展时间，避免仍在结算收益时被卡住判定误带回冥想。
- v2.93.0 本地验证目标：当 helper/面板初始化版本已等于当前脚本版本、但扩展 dataset 仍低一版时，状态报告应显示“页面已加载新版，扩展提示待下次重载统一”，不要要求测试者重载扩展。
- v2.94.0 本地验证目标：默认奇遇暂停模式下，未完成且有选项的奇遇仍等待手动/策略处理；已完成且只剩结束/关闭按钮的奇遇应自动关闭收尾，状态报告明确“不自动选择新剧情”；关闭 `autoCloseCompletedAdventure` 后应恢复等待。
- v2.95.0 本地验证目标：奇遇策略自动选择同一步同一选项后，页面未推进时不重复点击；复制状态应显示“本步已触发自动选择”和等待页面推进/手动处理建议，步骤变化后才允许再次执行策略选择。
- v2.96.0 本地验证目标：AFK 快照每轮优先读取 `/api/player/info`；当接口返回的神识比 `_lastPlayerData` 更新时，决策和状态报告使用新鲜神识，确保神识低于阈值、单次消耗或倍率整组消耗时及时回冥想。
- v2.97.0 本地验证目标：自动护道只作为 1 倍挂机保护；当自动护道与 5/10/20/50 倍探索同时开启时，风险预检应有批量探索护道警告，遭遇处理应记录 `guardian-batch-explore-unavailable` 并等待测试者使用富裕战斗链路或手动处理。
- v2.98.0 本地验证目标：玩家接口和 `_lastPlayerData` 都不可用时，AFK 快照从可见 `#statSpirit` 与 `#exploreBtn` 只读补齐神识和单次消耗；接口/cache 有新鲜数值时仍优先使用接口/cache。
- v2.99.0 本地验证目标：冥想条有恢复神识且摘要能确定已冥想/计划时长时，状态报告显示 `冥想预计:`，估算当前有效神识和计划收功神识；该行只用于测试解释，不影响收功决策。
- v2.100.0 本地验证目标：状态报告在能读到当前神识和单次探索消耗时显示 `探索续航:`，按配置倍率计算每组神识消耗和可跑组数；冥想中应使用已恢复神识给出当前估算和计划收功估算；当前神识不足一组高倍率时显示 `不足当前倍率`，但不影响原有 AFK 决策。自动探索进展签名应优先从游戏日志容器读取，不被聊天/说明等非日志区域误导。
- v2.101.0 本地验证目标：页面或接口摘要出现 `天道禁闭` / `code=430` 时，挂机决策应等待 `heavenly-ban`，状态报告应显示 `阻塞: 天道禁闭`、`硬停:` 和 `硬停建议:`；该状态只读提示，不自动解除、不点击、不消耗资源。
- v2.102.0 本地验证目标：云游商人最高价购买通过页面函数触发后应和 API 路径一样执行窗口清理、日志/玩家信息刷新和自动探索恢复兜底；如果购买已触发但连续等待商人窗口，状态报告应显示“云游商人购买已触发但窗口仍未关闭”的诊断归因。
- v2.103.0 本地验证目标：商人购买成功后应进入 AFK 事件恢复窗口，下一轮状态报告能显示 `恢复: 事件恢复窗口`，并按现有恢复逻辑在神识足够且无阻塞时接回配置倍率自动探索。
- v2.104.0 本地验证目标：战斗、护道、奇遇、陌生道友和商人购买成功后的事件恢复窗口都应使用同一调度规则；AFK 关闭时只记录恢复窗口/刷新数据，不主动安排下一轮 `tick(true)`，AFK 开启时仍能按 `resumeWindowSeconds` 续上下一轮检查。
- v2.105.0 本地验证目标：摘要回放“导入策略”应接受 JSON `strategyHints.mapLine`、纯 `456=2` 文本、可读状态里的 `奇遇策略: 456=2 / 789=1`，以及动作行里的 `#456 · 第2项`；导入后挂机状态必须关闭，策略模式打开，且步骤描述如 `#999 第1/3步` 不应被误导入。
- v2.106.0 本地验证目标：商人接口返回空商品或读取失败时，如果可见商人弹窗已渲染商品卡片，自动商人应从 DOM 解析最高价商品和购买 index，继续走原有购买、清理和事件恢复窗口；隐藏商人 DOM 不应被解析。
- v2.106.0 只读 Edge 游戏页证据：刷新游戏标签 `292345957` 前确认 AFK 关闭、自动探索未运行、自动恢复挂起 false、商人未激活；刷新后 helper/initialized 为 `2.106.0`，新 hook `extractMerchantItemsFromDom` 存在，纯函数最高价选择补 `index:1`，控制台 error 为空；未点击任何收功、探索、商人购买、护道、战斗、复活、用符、用丹、奇遇或道友按钮。
- v2.107.0 本地验证结果：已确认商人无商品/无可买价格且开关开启时，自动离开商人并恢复挂机；商人 API 读取失败时不离开，只记录失败。全量自动测试 118/118 通过，helper/loader 语法检查、manifest 解析和 `git diff --check` 均通过。
- v2.107.0 只读 Edge 游戏页证据：刷新游戏标签 `292345957` 前确认 AFK 关闭、自动探索未运行、自动恢复挂起 false、商人未激活；刷新后 helper/initialized 为 `2.107.0`，`MerchantAutoBuyer.leaveMerchant` 与页面 `leaveMerchant()` 均存在，控制台 error 为空；extension/injected dataset 仍旧，状态报告显示“页面已加载新版，扩展提示待下次重载统一”；未点击任何收功、探索、商人购买、商人离开、护道、战斗、复活、用符、用丹、奇遇或道友按钮。
- v2.108.0 本地验证结果：最高价购买已触发但商人窗口仍活跃且 key 未变化时，默认自动离开残留商人窗口并恢复挂机；关闭 `leaveAfterPurchaseStuck` 时不离开；购买失败和读取失败仍不走自动离开。全量自动测试 121/121 通过，helper/loader 语法检查、manifest 解析和 `git diff --check` 均通过。
- v2.108.0 只读 Edge 游戏页证据：刷新游戏标签 `292345957` 前确认 AFK 关闭、自动探索未运行、自动恢复挂起 false、商人未激活；刷新后等待页面稳定，helper/initialized 为 `2.108.0`，新版商人逻辑已加载，页面 `leaveMerchant()` 存在，控制台 error 为空；extension/injected dataset 仍旧；未点击任何收功、探索、商人购买、商人离开、护道、战斗、复活、用符、用丹、奇遇或道友按钮。
- v2.109.0 本地验证目标：AFK 配置包导出时包含 `merchant` 配置；导入时同步商人配置但仍关闭 `afkLoop.enabled`，避免导入后自动启动挂机；旧配置包缺少商人字段时继续兼容。
- v2.109.0 本地验证结果：配置包导出/导入覆盖 `merchant.enabled`、`onlyAutoExplore`、`buyDelay`、`leaveWhenNoItems`、`leaveAfterPurchaseStuck`；导入仍强制关闭 AFK。全量自动测试 121/121 通过，helper/loader 语法检查、manifest 解析和 `git diff --check` 均通过，并已同步 standalone helper 与 Windows Edge 扩展目录。
- v2.109.0 只读 Edge 游戏页证据：刷新游戏标签 `292345957` 后 helper/test hook 为 `2.109.0`，`normalizeMerchantConfig` 和 `buildAfkConfigPack` 存在；页面纯函数生成的配置包包含 `merchant`，导入后 `afkLoop.enabled=false`。AFK 关闭、自动探索未运行、商人/遭遇未激活、玩家冥想中，控制台 error 为空；extension dataset 仍显示旧 `2.99.0` 但页面 helper 已加载新版。未点击任何收功、探索、商人购买、商人离开、护道、战斗、复活、用符、用丹、奇遇或道友按钮。
- v2.110.0 本地验证目标：套用稳妥/护道/富裕挂机预设时，一并固定自动商人安全策略，避免预设测试继承本机旧商人开关。
- v2.110.0 本地验证结果：预设应用新增 `applyAfkAutomationPreset`，三个预设都会一并重置自动商人为最高价购买、仅自动探索/挂机循环处理、购买延迟 800ms、无商品自动离开和购买后卡窗自动离开。全量自动测试 122/122 通过，helper/loader 语法检查、manifest 解析和 `git diff --check` 均通过，并已同步 standalone helper 与 Windows Edge 扩展目录。
- v2.110.0 只读 Edge 游戏页证据：刷新游戏标签 `292345957` 前确认 AFK 关闭、自动探索未运行，商人/遭遇只是隐藏 DOM 残留且不可见；刷新后 helper/test hook 为 `2.110.0`，`applyAfkAutomationPreset` 存在。页面纯函数模拟富裕预设输出 50 倍、自动迎战/用符/用丹开启，并把商人配置重置为 enabled、onlyAutoExplore、800ms、无商品离开、购买后卡窗离开；控制台 error 为空。未点击任何收功、探索、商人购买、商人离开、护道、战斗、复活、用符、用丹、奇遇或道友按钮。
- v2.111.0 本地验证目标：状态报告的预设匹配/漂移诊断纳入自动商人策略；AFK 循环匹配但商人配置偏离时，`模式:` 行应提示具体商人差异。
- v2.112.0 本地验证目标：复制状态报告应直接显示当前自动商人配置，便于测试者确认最高价购买是否开启、是否仅限自动探索/挂机循环、购买延迟、无商品离开和购买后卡窗离开。
- v2.112.0 本地验证结果：新增 `商人配置:` 状态行，例如 `商人配置: 开启 · 仅自动探索/挂机循环 · 延迟800ms · 无商品离开 · 购买后卡窗离开`。全量自动测试 124/124 通过，helper/loader 语法检查和 manifest 解析通过；该变更只增强报告，不新增商人购买、商人离开或其他游戏资源动作。
- v2.112.0 只读 Edge 游戏页证据：同步 main repo、standalone helper 和 Windows Edge 扩展目录后，接管真实 Edge profile `edge-personal-lingverse` 的游戏标签 `292345957`。刷新前 helper/initialized 为 `2.111.0`，AFK 关闭、自动探索未运行、商人未激活；刷新游戏页后 helper/initialized 为 `2.112.0`，`buildAfkMerchantConfigStatusLine` 存在，纯报告模拟输出 `商人配置: 开启 · 仅自动探索/挂机循环 · 延迟800ms · 无商品离开 · 购买后卡窗离开`，控制台 error 为空。extension/injected dataset 仍显示旧 `2.99.0`，但当前页面 helper 已加载新版。本次只刷新游戏页、读取变量和纯函数模拟，未点击收功、探索、商人购买、商人离开、护道、战斗、复活、用符、用丹、奇遇或道友按钮。
- v2.113.0 本地验证目标：富裕 50 倍链路中，如果用符已完成但符箓面板关闭失败，下一轮快照确认同一遭遇的符窗仍可见时，应先关闭残留符窗，再恢复后续迎战判断；快照未确认符窗可见时仍保持原来的安全等待。
- v2.113.0 本地验证结果：新增 `resolveCombatTalismanDialogCloseAttempt` 和 `AfkLoopManager.closeStuckTalismanDialog`，覆盖“同一遭遇符窗残留 -> 关闭 -> 继续迎战”的测试，同时保留“关闭失败且当前快照未确认可见 -> 不迎战”的旧保护。该变更只关闭残留符窗，不新增额外用符、迎战、复活、探索或商人动作。
- v2.114.0 本地验证目标：页面仍残留云游商人状态，但 `/api/game/merchant` 明确返回“没有遇到云游商人/不在云游商人/已离开”时，应清理残留商人窗口、刷新页面状态并进入事件恢复窗口；临时读取异常仍保持读取失败，不自动离开或购买。
- v2.114.0 本地验证结果：新增 `MerchantAutoBuyer clears stale merchant state when API says merchant is gone`，目标红灯确认后实现并通过；接口明确商人不存在时记录 `stale-cleared`、清理残留商人 UI 并恢复挂机，读取异常仍保持 `read-failed`。全量自动测试 127/127 通过，helper/loader 语法检查、manifest 解析和 `git diff --check` 均通过。
- v2.114.0 只读 Edge 游戏页证据：同步 main repo、standalone helper 和 Windows Edge 扩展目录后，使用 Agent Browser CLI 接管真实 Edge profile `edge-personal-lingverse` 的 `https://ling.muge.info/game.html` 标签 `292345957`。刷新前 helper/initialized/hook 为 `2.112.0`，AFK 关闭、自动探索未运行、自动恢复挂起 false、商人/遭遇/奇遇/符箓弹窗均未激活；刷新游戏页后等待注入完成，helper/initialized/hook 均为 `2.114.0`，控制台 error 列表为空。extension/injected dataset 仍显示旧 `2.99.0`，但当前页面 helper 已加载新版。本次只刷新游戏页、读取状态和控制台，未点击收功、探索、商人购买、商人离开、护道、战斗、复活、用符、用丹、奇遇或道友按钮。
- v2.115.0 本地验证目标：陌生道友自动婉拒执行器必须和快照检测一样只处理可见弹窗；隐藏 PVP 邂逅残留不应抢在可见邀请前被关闭，兜底按钮搜索也不应点击隐藏容器里的“离开/取消”。
- v2.115.0 本地验证结果：新增 `handlePlayerEncounter ignores hidden player encounter modules and uses the visible invite` 与 `clickPlayerEncounterDeclineButton ignores hidden encounter containers`，目标红灯确认后实现并通过；陌生道友自动婉拒入口和兜底按钮现在都统一跳过隐藏 DOM 残留。全量自动测试 129/129 通过，helper/loader 语法检查、manifest 解析和 `git diff --check` 均通过。本次未刷新真实 Edge，等待下次统一实测加载。
- v2.116.0 本地验证目标：自动探索返回明确资源不足错误时，`体力不足/精力不足/灵力不足` 应和 `神识不足` 一样归类为 `noSpirit/meditate`，让挂机回冥想；普通接口异常仍应保持 `explore-error` 暂停。
- v2.116.0 本地验证结果：新增 `detectExploreResourceShortageNotice()` 与 `classifyExploreInterruption categorizes auto-explore stopping events` 覆盖，目标红灯确认后实现并通过；自动探索资源不足会进入回冥想，未知探索错误仍暂停。全量自动测试 129/129 通过。
- v2.117.0 本地验证目标：自动探索启动入口失败且失败消息明确资源不足时，应记录 `resource-shortage`，下一轮快照带 `exploreStartResourceShortage` 并回冥想；普通启动失败仍保持原有 `start-failed` 诊断。
- v2.117.0 本地验证结果：新增 `startAutoExplore records resource shortage failures for meditation recovery` 与 `decideAfkNextAction returns to meditation after explore start resource shortage`，目标红灯确认后实现并通过；启动入口资源不足不再反复尝试探索，而是进入统一回冥想决策。
- v2.117.0 Edge 读回证据：同步 main repo、standalone helper 和 Windows Edge 扩展目录后，使用 Agent Browser CLI 接管真实 Edge profile `edge-personal-lingverse` 的游戏标签 `292345957`。重载 LingVerse 扩展并刷新游戏页后，helper/hook/initialized 均为 `2.117.0`，AFK 未启动、自动探索未运行、商人/遭遇/奇遇/陌生道友/符箓弹窗均未激活；纯函数模拟 `exploreStartResourceShortage=true` 返回 `startMeditation/explore-start-no-spirit`。本次未点击收功、探索、商人购买、商人离开、护道、战斗、复活、用符、用丹、奇遇或道友按钮。
- v2.118.0 本地验证目标：云游商人最高价商品购买失败且失败消息明确为灵石/余额等货币不足时，应记录 `insufficient-funds` 并按配置自动离开商人恢复挂机；关闭该开关时仍保持购买失败停留，普通购买失败不自动离开。
- v2.118.0 本地验证结果：新增 `detectMerchantInsufficientFundsNotice()`、`MerchantAutoBuyer leaves merchant after explicit insufficient funds purchase failures`、`MerchantAutoBuyer keeps merchant open after insufficient funds when auto leave is disabled` 和对应状态报告覆盖；全量自动测试 134/134 通过。自动商人配置包、预设匹配和 `商人配置:` 状态行已包含 `leaveOnInsufficientFunds`，默认开启。
- v2.118.0 Edge 读回证据：同步 main repo、standalone helper 和 Windows Edge 扩展目录后，使用 Agent Browser CLI 接管真实 Edge profile `edge-personal-lingverse` 的游戏标签 `292345957`。刷新前确认 AFK 关闭、自动探索未运行、自动恢复挂起 false、商人/遭遇/奇遇均未激活；刷新游戏页后 helper/hook/initialized 均为 `2.118.0`，新 hook `detectMerchantInsufficientFundsNotice` 存在，纯函数模拟 `灵石不足/余额不足` 返回 true、`神识不足` 返回 false，`商人配置:` 行显示 `灵石不足离开`，控制台 error 为 0。extension/injected dataset 仍显示旧 `2.99.0`，但当前页面 helper 已加载新版。本次只刷新游戏页、读取状态和纯函数模拟，未点击收功、探索、商人购买、商人离开、护道、战斗、复活、用符、用丹、奇遇或道友按钮。
- v2.119.0 本地验证目标：当页面自动探索开关仍勾选，但游戏原生 `_autoExploreRunning=false` 且 `_autoResumeExplorePending=false` 时，不应继续把 UI 开关当成运行中；挂机快照应标记 `autoExploreToggleStale`，下一步应以 `auto-explore-toggle-stale` 重新启动自动探索，状态报告显示 `探索: 开关失配`。
- v2.119.0 本地验证结果：新增 `AfkLoopManager detects stale auto-explore toggle and restarts exploration` 覆盖；`buildSnapshot()` 在有页面原生运行/恢复标志时优先信任页面标志，只在页面标志不可用时才回退 UI 开关；调试摘要和状态报告已暴露 `autoExploreToggleStale` 与“开关失配”。全量自动测试 135/135 通过，helper/loader 语法检查、manifest 解析和 `git diff --check` 均通过。
- v2.119.0 Edge 读回证据：同步 main repo、standalone helper 和 Windows Edge 扩展目录后，使用 Agent Browser CLI 接管真实 Edge profile `edge-personal-lingverse` 的游戏标签 `292345957`。刷新前确认 AFK 关闭、自动探索未运行、自动恢复挂起 false、商人/遭遇/奇遇/符箓弹窗均未激活；刷新游戏页后 helper/hook/initialized 均为 `2.119.0`，纯函数模拟 `autoExploreToggleStale=true` 生成 `挂机状态 · 启动探索 · 自动探索开关失配` 且报告包含 `探索: 开关失配`，控制台 error 为 0。本次只刷新游戏页、读取状态和纯函数模拟，未点击收功、探索、商人购买、商人离开、护道、战斗、复活、用符、用丹、奇遇或道友按钮。
- v2.120.0 本地验证目标：当可见冥想条恢复神识加缓存神识已经超过神识上限时，复制状态应显示 `冥想溢出:`，写明估算神识、超出多少识，并提示可收功探索或缩短冥想时间；该行只用于解释自定义冥想时长是否浪费，不新增自动收功/探索/资源动作。
- v2.120.0 本地验证结果：新增 `buildAfkStatusReport flags wasted meditation overflow from the visible bar` 覆盖真实 Edge 观察到的 `966/2756 + 恢复4011识` 场景，状态报告输出 `冥想溢出: 估算4977/2756 · 超出2221识 · 可收功探索或缩短冥想时间`。全量自动测试 136/136 通过，helper/loader 语法检查、manifest 解析和 `git diff --check` 均通过；该变更只增强状态报告，不新增收功、探索、商人、护道、战斗、复活、用符、用丹、奇遇或道友动作。
- v2.120.0 Edge 读回证据：同步 main repo、standalone helper 和 Windows Edge 扩展目录后，使用 Agent Browser CLI 接管真实 Edge profile `edge-personal-lingverse` 的游戏标签 `292345957`。刷新前确认 AFK 关闭、自动探索未运行、自动恢复挂起 false、商人/遭遇/奇遇/符箓弹窗均未激活；刷新游戏页后 helper/hook/initialized 均为 `2.120.0`。当前可见冥想条 `7时25分`、恢复 `4086识`，状态栏 `966/2,756`；纯状态报告模拟返回 `挂机状态 · 结束冥想 · 神识已满`，并输出 `冥想溢出: 估算5052/2756 · 超出2296识 · 可收功探索或缩短冥想时间`，控制台 error 为 0。本次只刷新游戏页、读取状态和纯函数模拟，未点击收功、探索、商人购买、商人离开、护道、战斗、复活、用符、用丹、奇遇或道友按钮。
- v2.121.0 本地验证目标：冥想溢出时，复制状态应同时显示 `冥想调时:`，按当前恢复速度估算约多少分钟可满识、本次已冥想多久、超过满识点多久和当前配置分钟数，便于测试者调整自定义冥想时间；该行只读报告，不新增自动收功、探索或资源动作。
- v2.121.0 本地验证结果：扩展 `buildAfkStatusReport flags wasted meditation overflow from the visible bar` 覆盖 `冥想调时: 约195分钟可满识 · 已冥想437分钟 · 超出满识约242分钟 · 当前配置140分钟`。全量自动测试 136/136 通过，helper/loader 语法检查、manifest 解析和 `git diff --check` 均通过；该变更只增强状态报告，不新增收功、探索、商人、护道、战斗、复活、用符、用丹、奇遇或道友动作。
- v2.122.0 本地验证目标：自动商人真正购买最高价商品时应优先走 `/api/game/merchant/buy`，读取真实 `code/message`；页面 `buyMerchantItem(index)` 只作为 API 不可用时的兜底，避免真实页函数吞掉失败 toast 后被 helper 误判为购买已触发。自动离开商人同样优先走 `/api/game/merchant/leave`，失败时应保留 `leave-failed` 诊断。
- v2.122.0 本地验证结果：新增 `MerchantAutoBuyer prefers API purchases over page functions to observe failures` 覆盖页面函数存在但 API 返回 `灵石不足，无法购买` 的场景；脚本没有调用页面函数，而是记录货币不足并按配置调用离开商人恢复挂机。全量自动测试 137/137 通过，helper/loader 语法检查、manifest 解析和 `git diff --check` 均通过。
- v2.122.0 Edge 读回证据：同步 main repo、standalone helper 和 Windows Edge 扩展目录后，使用 Agent Browser CLI 接管真实 Edge profile `edge-personal-lingverse` 的游戏标签 `292345957` 并只刷新游戏页；helper/hook/initialized 均为 `2.122.0`。真实页 `buyMerchantItem(index)` 源码确认会吞掉失败只弹 toast；helper 源码读回 `API.buyMerchantItem` 位于 `_win.buyMerchantItem` 前、`API.leaveMerchant` 位于 `_win.leaveMerchant` 前。纯函数模拟最高价选择返回 `index:1`，`灵石不足` 识别 true、`神识不足` 识别 false，归一化 `商人配置:` 显示 `开启 · 仅自动探索/挂机循环 · 延迟800ms · 无商品离开 · 购买后卡窗离开 · 灵石不足离开`。AFK 关闭、自动探索未运行、商人未激活；控制台有 4 条非 LingVerse helper URL 的外部扩展 `chrome-extension://amkb.../content_main.js` `Uncaught (in promise)` 噪声。本次未点击收功、探索、商人购买、商人离开、护道、战斗、复活、用符、用丹、奇遇或道友按钮。
- v2.123.0 本地验证目标：低境界 1 倍护道模式下，自动护道应优先使用真实页 `tryAutoHireProtectorForEncounter({ silent:false })` 或 `/api/game/encounter-auto-hire`，读取成功/失败结果；只有页面函数和 API 都不可用时才回退 `#encounterHireProtectorBtn`。如果页面函数返回失败并写入 `_lastAutoHireProtectorFailure`，状态摘要应记录 `hire-failed` 和真实失败消息，不能因为按钮存在就误判 `hire-triggered`。
- v2.123.0 本地验证结果：新增 `tryHireEncounterGuardian prefers page auto-hire result over clicking the hire button`，先红灯确认旧逻辑会直接点按钮并误报成功；实现后目标测试通过，失败消息 `没有符合条件的护道者` 会进入 `lastGuardianAttempt.failureMessage`，本次遭遇会被标记已尝试，避免重复扣费。全量自动测试 138/138 通过，helper/loader 语法检查、manifest 解析和 `git diff --check` 均通过。
- v2.123.0 Edge 读回证据：同步 main repo、standalone helper 和 Windows Edge 扩展目录后，使用 Agent Browser CLI 接管真实 Edge profile `edge-personal-lingverse` 的游戏标签 `292345957` 并只刷新游戏页；helper/hook/initialized 均为 `2.123.0`，真实页 `tryAutoHireProtectorForEncounter` 存在。helper 源码读回 `tryAutoHireProtectorForEncounter` 位于 `#encounterHireProtectorBtn` 前，`API.autoHireGuardian` 也位于按钮前。AFK 关闭、自动探索未运行、商人/遭遇/战斗均未激活，玩家冥想中；控制台 error 为 0。本次未点击收功、探索、商人购买、商人离开、护道、战斗、复活、用符、用丹、奇遇或道友按钮。
- v2.124.0 本地验证目标：富裕 50 倍链路里自动迎战应优先调用 `/api/game/combat-choice` 并读取真实 `code/message`；只有 API 不可用时才回退页面 `handleCombatChoice('fight')` 或 `#encounterFightBtn`，避免按钮点击或页面函数吞掉失败 toast 后误记为 `fight-triggered`。
- v2.124.0 本地验证结果：新增 `fightEncounter prefers API fight result over clicking the fight button`，先红灯确认旧逻辑在按钮存在时直接点击并进入恢复窗口；实现后 API 返回 `战斗状态已变化` 时只记录 `fight-failed · api`，不点击按钮、不调用页面函数、不标记本遭遇已迎战。全量自动测试 139/139 通过，helper/loader 语法检查和 manifest 解析通过。
- v2.124.0 Edge 读回证据：同步 main repo、standalone helper 和 Windows Edge 扩展目录后，使用 Agent Browser CLI 接管真实 Edge profile `edge-personal-lingverse` 的游戏标签 `292345957`。刷新前确认 AFK 关闭、自动探索未运行、商人/遭遇/战斗/奇遇均未激活；刷新游戏页后 helper/hook/initialized 均为 `2.124.0`，`fightEncounter` 源码确认 `API.combatChoice('fight')` 位于 `handleCombatChoice` 和 `#encounterFightBtn` 前。extension dataset 仍显示旧 `2.99.0`，但当前页面 helper 已加载新版；控制台 error 为 0。本次未点击收功、探索、商人购买、商人离开、护道、战斗、复活、用符、用丹、奇遇或道友按钮。
- v2.125.0 本地验证目标：自定义 140 分钟或神识已满触发收功时，`handleStopMeditate()` / `/api/game/meditate/stop` 返回后必须确认页面不再显示冥想中；如果 `_lastPlayerData`、冥想状态接口或可见冥想条仍显示冥想中，应记录 `stop-failed`，清空收功恢复窗口，不能误接自动探索。
- v2.125.0 本地验证结果：新增 `AfkLoopManager.stopMeditation does not open resume window when meditation remains active`，先红灯确认旧逻辑只调用页面函数并直接刷新；实现后未确认收功会记录 `收功入口已调用但页面仍显示冥想中`，`postMeditationResumeUntil=0`，`lastDecisionKey` 清空以便下一轮重新记录决策。全量自动测试 140/140 通过，helper/loader 语法检查和 manifest 解析通过。
- v2.126.0 本地验证目标：低神识、探索卡住或资源不足触发回冥想时，`handleMeditate()` / `/api/game/meditate/start` 返回后必须确认页面已经显示冥想中；如果 `_lastPlayerData`、冥想状态接口和可见冥想条仍都没有进入冥想，应记录 `start-failed`，不能误记 `start-triggered` 后静默等待。
- v2.126.0 本地验证结果：新增 `AfkLoopManager.startMeditation records failure when meditation does not become active`，先红灯确认旧逻辑只调用页面函数并直接刷新；实现后未确认入定会记录 `冥想入口已调用但页面仍未显示冥想中`，并清空 `lastDecisionKey` 让下一轮重新输出诊断。全量自动测试 141/141 通过，helper/loader 语法检查和 manifest 解析通过。
- v2.127.0 本地验证目标：陌生道友自动婉拒/离开入口返回后，应确认当前可见邂逅弹窗已经关闭；如果 PVP、邀约、会话、交易、战斗或响应选择弹窗仍可见，应记录 `decline-failed`，不能误记 `decline-triggered` 并进入事件恢复窗口。
- v2.127.0 本地验证结果：新增 `handlePlayerEncounter records failure when decline does not close the encounter`，先红灯确认旧逻辑调用 `respondInvite(false)` 后直接打开恢复窗口；实现后未确认关闭会记录 `陌生道友弹窗仍未关闭`，不调用 `schedulePostInteractionResume`。全量自动测试 142/142 通过，helper/loader 语法检查和 manifest 解析通过。
- v2.128.0 本地验证目标：奇遇策略/固定选择入口返回后，应确认奇遇页面已经推进或关闭；如果仍停在同一个 `adventureId + step + totalSteps + choiceIndex`，应记录 `choice-failed`，不能误记 `choice-triggered` 并进入事件恢复窗口。
- v2.128.0 本地验证结果：新增 `handleAdventure records failure when a choice does not advance the adventure step` 与 `handleAdventure confirms choice progress with the current adventure strategy config`，先红灯确认旧确认路径会误判推进并安排恢复；实现后确认逻辑使用本次传入的奇遇策略配置，同一步未推进会记录 `奇遇选择入口已调用但页面仍停在同一步`，不调用 `schedulePostInteractionResume`。
- v2.128.0 Edge 读回证据：同步 main repo、standalone helper 和 Windows Edge 扩展目录后，使用 Agent Browser CLI 接管真实 Edge profile `edge-personal-lingverse` 的游戏标签 `292345957`。刷新前 helper/hook/initialized 为 `2.124.0`，AFK 关闭、自动探索未运行、商人/遭遇/奇遇/陌生道友均未激活，玩家冥想中；刷新游戏页后 helper/hook/initialized 均为 `2.128.0`，`confirmAdventureProgressed` 测试钩子存在，控制台 error 为 0。extension/injected dataset 仍显示旧 `2.99.0`，但当前页面 helper 已加载新版。本次只刷新游戏页和读取状态，未点击收功、探索、商人购买、商人离开、护道、战斗、复活、用符、用丹、奇遇或道友按钮。
- v2.129.0 本地验证目标：已完成奇遇自动关闭入口返回后，应确认奇遇面板已经消失；如果 `#adventureOverlay` 仍可见，应记录 `close-failed`，不能误记 `close-triggered` 并进入事件恢复窗口。
- v2.129.0 本地验证结果：新增 `handleAdventure records failure when completed adventure close does not close the overlay`，先红灯确认旧逻辑点击关闭后直接安排恢复；实现后关闭未确认会记录 `奇遇关闭入口已调用但面板仍未关闭`，保留本地奇遇选择去重键，不调用 `schedulePostInteractionResume`。
- v2.130.0 本地验证目标：富裕 50 倍链路里 `API.useItem` / 页面用丹入口返回成功后，必须继续确认五行通灵状态已经出现或刷新；未确认时应记录 `use-not-confirmed`，不能记为 `used`，也不能增加本轮涅槃重生丹次数。
- v2.130.0 本地验证结果：新增 `maybeUseNirvanaRebirthPill records failure when the five-root buff is not confirmed`、`buildAfkStatusReport explains unconfirmed nirvana pill attempts`、`buildAfkWaitingDiagnosis explains unconfirmed nirvana pill stalls`，覆盖用丹入口成功但未检测到 `fiveRootBuffGrade/fiveRootBuffExpire` 的情况；状态报告显示“用丹未确认”和“涅槃重生丹未确认生效”，等待诊断会把探索启动卡住归因到该失败，不进入误成功路径。
- v2.131.0 本地验证目标：扩展 content script 如果只留下 `lingverseAutoMapInjected=1` / 旧注入版本，但页面没有 helper 或初始化版本，不能因为重复注入保护而跳过；应重新注入 helper，避免 tester 刷新后只看到旧扩展 dataset 而没有挂机面板。
- v2.131.0 本地验证结果：新增 `extension loader retries injection when the marker exists but helper is missing`，先红灯确认旧 loader 只看注入标记会跳过；实现后 loader 只有在共享 DOM dataset 或全局里能看到 helper/initialized 版本时才跳过重复注入。helper 现在会把 `lingverseAutoMapHelperVersion` / `lingverseAutoMapInitializedVersion` 写入 `documentElement.dataset`，供扩展隔离世界判断。
- v2.132.0 本地验证目标：Agent 接管真实 Edge 时，应能直接打开助手面板并读回面板/版本/AFK/商人状态；不能因为主面板默认隐藏而误判“没有安装/没有接管”，也不能为了确认面板而点击收功、探索、商人购买、护道、战斗、复活、用符、用丹、奇遇或道友按钮。
- v2.132.0 本地验证结果：新增 `UI panel control hooks expose and toggle the helper panel without game actions`，先红灯确认 `showPanel/getPanelState` 不存在；实现后 `LingVerseAutoMapTestHooks.showPanel()` 会把 `#am-panel` 设为 `display:flex`，`hidePanel()` 会收起面板，`getPanelState()` 可读回 helper/initialized/extension/injected 版本、AFK 开关、商人开关和侧栏按钮存在性。该变更只增强 Agent/测试接管入口，不新增任何游戏资源动作。
- v2.132.0 Edge 读回证据：同步 main repo、standalone helper 和 Windows Edge 扩展目录后，使用 Agent Browser CLI 接管真实 Edge profile `edge-personal-lingverse` 的游戏标签 `292345957`。当前扩展/注入 dataset 仍为 `2.99.0`，因此手动注入 `/home/lxh/LingVerse-all/lingverse-explore-helper.user.js` 并重建助手面板；读回 helper/hook/initialized/DOM helper/DOM initialized 均为 `2.132.0`，`getPanelState()` 返回 `visible=true`、`display=flex`、`merchantEnabled=true`、`afkEnabled=false`，面板按钮包含“套用稳妥1倍 / 套用护道1倍 / 套用富裕50倍 / 启动挂机 / 复制状态 / 复制摘要”。截图保存到 `/tmp/lingverse-v2.132-panel.png`。本次只操作助手面板显示和只读状态，未点击收功、探索、商人购买、商人离开、护道、战斗、复活、用符、用丹、奇遇或道友按钮。
- v2.133.0 本地验证目标：挂机循环出现有效重复等待诊断时，应自动保存最近一次脱敏卡点快照到 `localStorage`，并通过面板“复制最近卡点”和 `LingVerseAutoMapTestHooks.getLastAfkIssueSnapshot()` 读回；保存内容应复用现有脱敏摘要/可读报告，URL query/hash 和敏感参数必须清理，普通巡检不应写入，也不新增收功、探索、商人购买、商人离开、护道、战斗、复活、用符、用丹、奇遇或道友动作。
- v2.133.0 本地验证结果：新增 `AfkLoopManager saves active wait diagnosis snapshots for later tester readback`，先红灯确认没有读回 hook；实现后 AFK tick 在重复奇遇等待诊断 active 时保存 `lingverse-afk-last-issue-snapshot/v1`，读回报告包含 `诊断:` 行，摘要里的 URL 不含 `token=secret`。面板新增“复制最近卡点”，hook 暴露 `buildAfkLastIssueSnapshotRecord` / `saveAfkLastIssueSnapshot` / `getLastAfkIssueSnapshot` / `clearLastAfkIssueSnapshot`。全量自动测试 151/151 通过，helper/loader 语法检查、manifest 解析和 `git diff --check` 均通过；该变更只增强诊断留存，不新增任何游戏资源动作。
- v2.133.0 Edge 读回证据：同步 main repo、standalone helper 和 Windows Edge 扩展目录后，使用 Agent Browser CLI 接管真实 Edge profile `edge-personal-lingverse` 的游戏标签 `292345957`。当前扩展/注入 dataset 仍为 `2.99.0`，因此手动注入 `/home/lxh/LingVerse-all/lingverse-explore-helper.user.js` 并重建助手面板；读回 helper/hook/initialized/DOM helper/DOM initialized 均为 `2.133.0`，`panelState.visible=true`、`display=flex`、`merchantEnabled=true`、`afkEnabled=false`，面板包含“复制最近卡点”。纯 hook 演练用脱敏 debug snapshot 保存/读回 `lingverse-afk-last-issue-snapshot/v1`，`reason=adventure-active`、`likelyCause=奇遇#456未配置自动策略`、报告含 `诊断:` 行、摘要 URL 不含 query/hash；演练后已调用 `clearLastAfkIssueSnapshot()` 清除假卡点。当前 AFK 关闭、自动探索未运行、商人/遭遇/奇遇/陌生道友均未激活，玩家冥想中，神识 `1377/2756`。截图保存到 `/tmp/lingverse-v2.133-panel.png`。本次只操作助手面板显示、只读状态和诊断 key 演练，未点击收功、探索、商人购买、商人离开、护道、战斗、复活、用符、用丹、奇遇或道友按钮。
- v2.134.0 本地验证目标：多人长跑测试可能一晚出现多个不同卡点，单条“最近卡点”会被后续事件覆盖。应在保存最近卡点的同时维护 `lingverse_afk_issue_history_v1`，保留最近 5 条不同卡点；同一 `action/reason/firstAt/likelyCause/message` 的重复保存只更新不刷屏。面板新增“复制卡点历史”，hook 暴露 `getAfkIssueHistory()` / `clearAfkIssueHistory()`。该功能仍只保存脱敏摘要和可读报告，不新增任何游戏资源动作。
- v2.134.0 本地验证结果：新增 `AFK issue history keeps recent distinct stuck snapshots without duplicate spam`，覆盖最近 5 条不同卡点、重复卡点去重更新、历史清空和 hook 读回；全量自动测试 152/152 通过，helper/loader 语法检查、manifest 解析和 `git diff --check` 均通过。该变更只增强诊断留存和 Agent/测试者读回，不新增任何收功、探索、商人购买、商人离开、护道、战斗、复活、用符、用丹、奇遇或陌生道友动作。
- v2.134.0 Edge 读回证据：使用 Agent Browser CLI 接管真实 Edge profile `edge-personal-lingverse` 的游戏标签 `292345957`。当前扩展/注入 dataset 仍为 `2.99.0`，因此未刷新游戏页，直接手动注入 `/home/lxh/LingVerse-all/lingverse-explore-helper.user.js` 并展开助手面板；读回 helper/hook/initialized/DOM helper/DOM initialized 均为 `2.134.0`，`panelState.visible=true`、`display=flex`、`merchantEnabled=true`、`afkEnabled=false`，面板包含“复制卡点历史”，hook 暴露 `getAfkIssueHistory` / `clearAfkIssueHistory` / `AfkLoopManager.copyIssueHistory`，历史读回 schema 为 `lingverse-afk-issue-history/v1`。截图保存到 `/tmp/lingverse-v2.134-panel.png`。真实游戏日志显示此前自动商人已购买“稀有延寿丹”并离开商人，页面当前无自动探索、商人、奇遇 blocker。本次只手动注入 helper、展开助手面板、截图和读取状态，未点击收功、探索、商人购买、商人离开、护道、战斗、复活、用符、用丹、奇遇或陌生道友按钮。

## 下一步建议

1. 用户刷新页面/重载扩展后实测 v2.134.0：护道 1 倍预设重点观察“环境/阶段/模式/商人配置/冥想/冥想预计/探索续航/冥想兜底/冥想同步/冥想建议/恢复/回冥想/诊断/诊断归因/现场日志/商人/商人建议/护道/护道建议/硬停/硬停建议/最近卡点/卡点历史”；套用稳妥/护道/富裕预设后，自动商人应同步重置为最高价购买、仅自动探索/挂机循环处理、无商品离开、购买后卡窗离开和灵石不足离开，并在 `商人配置:` 行直接显示；Agent 接管时可先调用 `LingVerseAutoMapTestHooks.showPanel()` 展开面板并用 `getPanelState()` 读回状态，长跑卡住后用 `LingVerseAutoMapTestHooks.getLastAfkIssueSnapshot()` 读回最近一次脱敏卡点，或用 `LingVerseAutoMapTestHooks.getAfkIssueHistory()` 读回最近 5 条不同卡点历史；若之后手动改坏商人策略，`模式:` 行应显示对应商人漂移而不是继续显示已匹配预设；配置包复制/导入也应带上自动商人的购买延迟、无商品离开、购买后残留窗口离开和灵石不足离开设置；如果页面刚刷新时接口/cache 短暂为空，AFK 快照应能从可见状态栏和探索按钮补齐神识/单次消耗；如果页面可见冥想条和恢复神识，复制状态应显示当前估算神识和计划收功估算；如果能读到当前神识和单次探索消耗，复制状态应显示“探索续航”，高倍率不足一组时显示“约...次1倍探索”和“不足当前倍率”；如果页面可见冥想条但状态缓存不同步，复制状态里的“阶段/冥想”应仍显示已冥想时长，即使冥想条文本是一整行，也不应把“最长12小时”当作已冥想时长，并在 140 分钟或缓存神识+冥想条恢复神识达到上限时触发“神识已满”收功，同时“冥想兜底”应显示恢复值、缓存值和估算值，“冥想同步”应说明玩家缓存未标记冥想；入定入口返回后应确认页面已进入冥想，未确认时不误记成功；收功入口返回后应确认页面不再冥想，未确认时不进入收功恢复窗口；AFK 快照应优先读取新鲜玩家信息，神识低于阈值/单次消耗/当前倍率整组消耗时及时显示回冥想；成功收功后应出现“收功恢复窗口”，短时间内优先接上探索而不是马上又回冥想；收功恢复窗口内即使探索按钮短暂禁用，只要没有明确“神识不足/体力不足”，也应继续尝试 `post-meditation-ready`；隐藏在 DOM 里但 `display:none` / `visibility:hidden` / `aria-hidden` / 零尺寸的商人、遭遇、奇遇、陌生道友和冥想条不应误报阻塞；云游商人最高价购买应优先走 API 读取真实成功/失败，API 不可用时才回退页面函数；如果接口空商品但商人弹窗已显示商品，应能从弹窗 DOM 解析最高价商品继续购买，已确认无可买商品时应自动离开商人并恢复挂机，购买已触发但窗口仍未关闭时应自动离开残留商人窗口，明确灵石/余额不足时应自动离开商人，接口确认商人已不存在时应清理残留商人状态并恢复挂机，API 临时读取失败/普通购买失败时不应强退商人；事件恢复窗口应只在 AFK 开启时主动安排下一轮检查，AFK 关闭时只记录恢复状态；陌生道友婉拒后应确认弹窗已关闭，未关闭时不进入事件恢复窗口；游戏遭遇面板显示“自动雇护道...重试中/处理中/可手动接管”时，状态应显示“护道: 游戏护道处理中”并等待结算；自动护道搭配批量探索时，预检应提示“批量探索遭遇不能雇护道”，遭遇状态/建议应说明改用 1 倍护道或富裕 50 倍战斗链路；如果收功后没续上探索，`诊断归因:` 应显示“收功后未能重启探索 · 自动探索启动失败 · ...”；如果探索按钮禁用但状态没有写“神识不足”，只要神识低于阈值/单次消耗或不足当前倍率整组消耗，应显示回冥想而不是长期等待“当前区域不可探索”；探索疑似卡住回冥想时，`回冥想:` 应显示 `卡住判定...秒`；`环境:` 如提示 helper/扩展版本不一致、helper/面板版本不一致或面板版本未知，先刷新页面确认；如果 helper/面板已是新版但扩展提示仍旧，应显示“页面已加载新版，扩展提示待下次重载统一”；如果页面只有扩展注入标记但 helper/面板版本缺失，刷新后应由 loader 重新注入而不是长期没有面板；同一遭遇已尝试护道后卡住时 `诊断归因:` 应显示“本遭遇已尝试自动护道，避免重复扣费”；奇遇策略自动处理时状态应显示“奇遇动作:”和“奇遇建议:”，同一步同一选项已触发过时应显示“本步已触发自动选择”并等待页面推进，入口返回后仍停同一步时应显示“自动选择失败”且不进入恢复窗口，已完成奇遇关闭后面板仍可见时应显示“自动关闭失败”且不进入恢复窗口，重复未推进时 `诊断归因:` 应显示“奇遇#... 自动选择第...项...后仍未前进”；奇遇弹窗关闭后复制状态仍应显示最近 `奇遇样本:` 和 `奇遇策略:` 候选；摘要回放导入策略应能识别可读状态里的 `奇遇策略: 456=2 / 789=1` 和 `#456 · 第2项`；暂停模式下未完成奇遇仍等待，已完成奇遇应显示“奇遇动作: 准备关闭奇遇”和“不自动选择新剧情”；陌生道友自动婉拒尝试后状态应显示“陌生道友:”和“陌生道友建议:”，未关闭时 `诊断归因:` 应显示“陌生道友自动婉拒后仍未关闭”；富裕 50 倍小号测试重点观察“模式/商人配置/冥想/冥想预计/探索续航/冥想兜底/冥想同步/冥想建议/商人/商人建议/探索启动/探索建议/用丹/用丹建议/用符/用符建议/符窗关闭/迎战/迎战建议/复活/复活建议/恢复/回冥想/诊断归因/现场日志/预检”，确认自动迎战优先走 API 读取真实失败消息，同一遭遇不会重复触发迎战，符箓面板未关闭时不会继续自动迎战，下一轮确认残留符窗可见时会自动关闭后恢复迎战判断，50 倍神识不足整组时状态显示 `50倍需...`，涅槃重生丹入口返回成功后必须确认五行通灵状态，未确认时状态应显示 `用丹: 涅槃重生丹未确认` / `用丹建议: 涅槃重生丹未确认生效` 且不计入本轮用丹次数，复活入口返回后仍死亡时显示 `自动复活未确认` 且不进入 `复活恢复窗口`，AFK 循环运行时即使原生 `_autoResumeExplorePending` 丢失也能继续处理商人；战斗/事件处理后没续上 50 倍探索时 `诊断归因:` 应显示“事件恢复后未能重启探索”或“复活恢复后未能重启探索”。
2. 继续用真实挂机摘要收集“自动探索停住”的事件原因，尤其记录 `automation.guardian` 的失败 message。
3. 富裕 50 倍模式继续小号测试：用符、复活、用丹都保持 opt-in，并先用默认本轮上限观察战斗结算后恢复窗口是否够用。
4. 用真实奇遇链继续记录每个 adventureId 的选项、奖励和后续步骤，并把摘要里的 `strategyHints.mapLine` 沉淀到策略表。
5. 继续收集真实摘要，用回放视图沉淀低境界护道失败、富裕战斗失败和未知奇遇策略。
