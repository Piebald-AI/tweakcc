---
name: ldd
description: Loop-Driven Development - 设计人机协作的迭代优化循环。当用户想要优化提示词、改进模板、迭代配置，或者说"我想用 LDD"、"帮我设计一个优化循环"时使用。
---

# LDD - Loop-Driven Development

> 人机协作的迭代优化：人类定标准，AI 执行循环

## 核心理念

```
传统：Human-in-the-loop（人类执行，AI 辅助）
LDD：Human-on-the-loop（AI 执行，人类定标准 + 监督）
```

AI 擅长执行和迭代，但不擅长判断"什么是好的"。LDD 让人类定义验证标准，AI 负责执行优化循环。

## 适用场景

LDD 适用于**需要迭代且可验证**的任务：

- 优化提示词效果
- 改进代码/内容模板
- 迭代配置参数
- 任何"不确定什么是好的，需要试几轮"的任务

**不适合**：一次性任务、纯主观无法验证的任务

## 工作流

```
阶段 1: 界定 → 把模糊想法变成可处理的问题
阶段 2: 设计 EOVM → 设计闭环，设计过程中验证闭环是否成立
输出: .claude/skills/ldd/ldd.sh add <name> → 生成 LOOP-DESIGN.md
```

详细流程见 [loop-designer.md](loop-designer.md)

## 核心循环 EOVM

```
E → O → V → M → E → ...

Execute：执行动作，产生可观测的变化
Observe：捕获变化，形成可比较的形式
Verify：判断方向对不对（自动验证 / 人类在环）
Modify：归因 → 假设 → 对抗 → 修改 → 预期
```

## 验证模式

| 模式 | 验证者 | 适用场景 |
|------|--------|---------|
| **自动验证** | 硬指标 / AI 红旗检测 | 有明确规则 |
| **人类在环** | 人类判断（每轮参与） | 依赖审美、语感、专业判断 |

## 参考资料

- [Loop Designer 流程](loop-designer.md) - 如何设计一个 Loop
- [LDD 方法论](methodology.md) - 理论基础和原理

---

*LDD 的价值不在于全自动化，而在于结构化人机协作。*
