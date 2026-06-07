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

- 复活后 60 秒恢复窗口：如果神识仍足够，按配置倍率继续自动探索；如果神识不足，转入冥想。
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

风险：

- 50 倍遇怪失败会损失预扣神识。
- 复活和丹药都消耗资源。
- 符箓 family 顺序仍需要玩家按账号库存和实战收益调优。
- 当前账号未读到 `bp_pill_rebirth_*`，所以涅槃重生丹分支只做了选择策略测试，未做真实消耗验证。
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

浏览器验证：

- 使用 Agent Browser CLI 读真实 Edge 标签，不用论坛/聊天资料。
- 先只读状态和函数，不主动消耗资源。
- 资源动作只在用户明确试用或脚本配置开启后发生。

## 下一步建议

1. 把 v2.8.0 复制到 Edge 扩展测试目录，用户实测基础循环。
2. 把 v2.9.0 复制到 Edge 扩展测试目录，用户实测富裕模式开关但先不要开 `autoRevive`。
3. 用真实挂机日志收集“自动探索停住”的事件原因。
4. 把 v2.10.0 复制到 Edge 扩展测试目录，重点实测复活后是否能恢复到配置倍率。
5. 用真实奇遇链继续记录每个 adventureId 的选项、奖励和后续步骤。
6. 为快照补“复制后自动脱敏/压缩摘要”和“可导入的问题回放视图”。
