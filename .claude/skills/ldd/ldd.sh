#!/usr/bin/env bash

set -e

# LDD CLI - Loop-Driven Development 工具

LDD_DIR=".ldd"

# 生成 6 位 hex
generate_hex() {
  head -c 3 /dev/urandom | xxd -p
}

# 创建 README.md（LDD 原理）
create_readme() {
  cat > "$LDD_DIR/README.md" << 'EOF'
# LDD - Loop-Driven Development

> 人机协作的迭代优化：人类定标准，AI 执行循环

## 核心理念

```
传统：Human-in-the-loop（人类执行，AI 辅助）
LDD：Human-on-the-loop（AI 执行，人类定标准 + 监督）
```

AI 擅长执行和迭代，但不擅长判断"什么是好的"。LDD 让人类定义验证标准，AI 负责执行优化循环。

## 核心循环 EOVM

```
E → O → V → M → E → ...

Execute：执行动作，产生可观测的变化
Observe：捕获变化，形成可比较的形式
Verify：判断方向对不对（自动验证 / 人类在环）
Modify：归因 → 假设 → 对抗 → 修改 → 预期
```

## 验证模式

| 模式 | 验证者 | 每轮参与 | 适用场景 |
|------|--------|---------|---------|
| **自动验证** | 硬指标 / AI 红旗检测 | 自动 | 有明确规则 |
| **人类在环** | 人类判断 | 每轮 | 依赖审美、语感、专业判断 |

如果验证依赖人类判断，人类就是闭环的必要组成部分，每轮都需要参与。

## Modify 环节

M 不只是"改"，而是假设-验证的过程：

1. **归因**：为什么当前结果不够好？
2. **假设**：如果改 X，应该会变好
3. **对抗**：第三方审视，防止过拟合
4. **修改**：基于假设进行调整
5. **预期**：下一轮应该看到什么变化？

### 对抗位

执行 Loop 的 agent 有"通过验证"的动机，容易贪婪地选择特例化方案（过拟合）。需要引入没有 context 污染的第三方来审视修改。

## 目录结构

```
.ldd/
├── README.md                    # 本文件（LDD 原理）
└── {name}-{hex6}/
    └── LOOP-DESIGN.md           # 具体 Loop 设计
```

---

*LDD 的价值不在于全自动化，而在于结构化人机协作。*
EOF
  echo "Created $LDD_DIR/README.md"
}

# 创建 LOOP-DESIGN.md 模板
create_loop_design() {
  local project_dir="$1"
  local name="$2"

  cat > "$project_dir/LOOP-DESIGN.md" << EOF
# ${name} Loop 设计

> 本文档指导 agent 开发和运行优化循环
>
> 先阅读 ../.ldd/README.md 了解 LDD 原理

## 问题

问题陈述：
<!-- 一句话描述要解决什么 -->

边界：
<!-- 包括什么，不包括什么 -->

动机：
<!-- 为什么重要，真正想要什么 -->

---

## EOVM 循环设计

### Execute（执行）

**做什么**：
<!-- 描述执行动作 -->

- 输入：
- 操作：
- 产生的变化：

**开发指引**：
<!-- 告诉 agent 如何实现执行器 -->

---

### Observe（观测）

**做什么**：
<!-- 描述如何捕获结果 -->

- 捕获什么：
- 形式：<!-- 结构化 / 文本 / 指标 -->
- 如何比较：

**开发指引**：
<!-- 告诉 agent 如何实现观测器 -->

---

### Verify（验证）

**做什么**：
<!-- 描述如何判断方向对不对 -->

- 验证信号：
- 验证者：<!-- 自动 / 人类在环 -->
- 判断标准：

**验证模式**：<!-- 自动验证 / 人类在环 -->

<!-- 如果是自动验证 -->
硬指标规则：
红旗检测规则：

<!-- 如果是人类在环 -->
人类判断什么：
如何呈现给人类：

**开发指引**：
<!-- 告诉 agent 如何实现验证器 -->

---

### Modify（修改）

**做什么**：
<!-- 描述如何根据验证结果调整 -->

- 归因方式：<!-- 人类判断 / AI 分析 -->
- 修改目标：
- 如何验证假设：

**对抗位**：<!-- 是否需要，如何引入 -->

**开发指引**：
<!-- 告诉 agent 如何实现修改逻辑 -->

---

## 运行指引

### Loop 流程

\`\`\`
1. Execute:
2. Observe:
3. Verify:
4. Modify:
5. 回到 1，直到满足终止条件
\`\`\`

### 终止条件

-

### 人类参与点

-

---

## 辅助工具（如有）

<!-- 列出需要开发的辅助工具 -->
EOF
}

# add 命令
cmd_add() {
  local name="$1"

  if [ -z "$name" ]; then
    echo "Usage: ldd add <name>"
    echo "Example: ldd add prompt-optimizer"
    exit 1
  fi

  # 创建 .ldd 目录
  if [ ! -d "$LDD_DIR" ]; then
    mkdir -p "$LDD_DIR"
    echo "Created $LDD_DIR/"
  fi

  # 创建 README.md（如果不存在）
  if [ ! -f "$LDD_DIR/README.md" ]; then
    create_readme
  fi

  # 生成项目目录
  local hex=$(generate_hex)
  local project_dir="$LDD_DIR/${name}-${hex}"

  mkdir -p "$project_dir"
  echo "Created $project_dir/"

  # 创建 LOOP-DESIGN.md
  create_loop_design "$project_dir" "$name"
  echo "Created $project_dir/LOOP-DESIGN.md"

  echo ""
  echo "----------------------------------------"
  echo "Loop 项目已创建: $project_dir"
  echo ""
  echo "下一步："
  echo "1. 编辑 $project_dir/LOOP-DESIGN.md"
  echo "2. 填写问题陈述、边界、动机"
  echo "3. 设计 EOVM 各环节"
  echo "4. 补充开发指引"
  echo "----------------------------------------"
}

# 主命令
main() {
  local cmd="$1"
  shift || true

  case "$cmd" in
    add)
      cmd_add "$@"
      ;;
    *)
      echo "LDD - Loop-Driven Development"
      echo ""
      echo "Usage:"
      echo "  ldd add <name>    创建新的 Loop 项目"
      echo ""
      echo "Example:"
      echo "  ldd add prompt-optimizer"
      ;;
  esac
}

main "$@"
