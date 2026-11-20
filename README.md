# ssh2work-plugins

> **[ssh2work](https://github.com/is-hp-is-mad/ssh2work) 官方与社区插件仓库** —— 面向多服务器选手与远程开发工作流的纯 SSH 插件集合。
>
> 特别鸣谢 **[LINUX DO 社区 (https://linux.do)](https://linux.do)** 的灵感碰撞与开源贡献！

---

## 目录结构（按分类分目录存放）

所有插件统一存放在 `plugins/<分类>/<插件ID>/plugin.json` 下，且目录名必须与 `plugin.json` 中的 `id` 字段完全一致：

```text
ssh2work-plugins/
├── .github/
│   └── workflows/
│       └── plugin-pr-check.yml    # PR 自动化校验（动态权限 + 重复ID检测 + -community后缀校验 + Bot评论）
├── plugins/
│   ├── ai-agents/                 # AI 编程助手插件
│   │   ├── claude-code/
│   │   │   └── plugin.json        # id: "claude-code"
│   │   ├── codex-cli/
│   │   │   └── plugin.json        # id: "codex-cli"
│   │   ├── antigravity-cli/
│   │   │   └── plugin.json        # id: "antigravity-cli"
│   │   ├── pi-cli/
│   │   │   └── plugin.json        # id: "pi-cli"
│   │   └── opencode-cli/
│   │       └── plugin.json        # id: "opencode-cli"
│   └── devops/                    # 远程开发与容器/服务器运维插件
│       └── docker-devops/
│           └── plugin.json        # id: "docker-devops"
├── scripts/
│   ├── validate-plugins.mjs       # 插件规范与 PR 校验脚本
│   └── validate-plugins.test.mjs  # 校验器单元测试
├── LICENSE
└── README.md
```

---

## 插件清单规范 (`plugin.json`)

```json
{
  "id": "my-tool-community",
  "name": "我的远程工具",
  "version": "1.0.0",
  "author": "your-github-handle",
  "category": "devops",
  "description": "插件功能说明",
  "tab": null,
  "quickCommands": [
    {
      "id": "cmd-1",
      "name": "快捷指令名称",
      "command": "echo hello",
      "dir": "~"
    }
  ]
}
```

- `id`：仅允许小写字母、数字和连字符（`^[a-z0-9][a-z0-9-]*$`），且必须与所在文件夹名称一致。
- `name` / `version` / `description`：必填字段。
- `quickCommands`：可选数组，每项须包含非空的 `name` 与 `command`。

---

## PR 贡献与自动化校验规则

每次向 `main` 分支发起 PR 时，GitHub Actions（`plugin-pr-check.yml`）会自动执行以下校验：

1. **动态识别提交者权限**：
   - 工作流通过 GitHub API 动态查询仓库协作者权限（`admin` / `maintain` / `write`），**无需硬编码人员名单**，后续在仓库 Settings 中新增或移除管理员/协作者会自动生效。
2. **严格区分「新增插件」与「更新 / 修复（fix）已有插件」**：
   - **更新 / 修复已有插件**：修改已有插件路径下的 `plugin.json` 且保持 `id` 不变时，**不受重复 ID 拦截，也不受 `-community` 后缀限制**（社区贡献者同样可以直接提交已有插件的 bugfix PR）。
   - **新增插件**：
     - **重复 ID 检测**：若新插件的 `id` 与仓库中任何已有插件重复，工作流将**直接拒绝 PR**，并由 `github-actions[bot]` 在 PR 下发表评论，明确指出**与哪一个已有插件（路径 + ID）发生冲突**。
     - **社区后缀规范**：第三方贡献者提交的**新插件**，其插件 ID（及目录名）后缀必须为 `-community`（例如 `claude-code-community`）。
     - **管理员合并与转正**：仓库管理员 / 协作者可以直接提交无 `-community` 后缀的官方插件，或在审核社区插件 PR 后将其转正（移除 `-community` 后缀或合并进官方插件内部）。

---

## 本地测试与校验

```bash
# 运行校验脚本单元测试
npm test

# 校验本地全部插件目录
npm run validate
```

---

## 鸣谢与社区共建 (Acknowledgements)

本项目及插件生态在构思、打磨与开发过程中，深受 **[LINUX DO 社区 (https://linux.do)](https://linux.do)** 浓厚的技术分享氛围与众多佬友开源实践的启发。

在此特别感谢 **[LINUX DO (https://linux.do)](https://linux.do)** 社区以及所有热爱折腾多服务器运维、远程开发与 AI 辅助编程的佬友们！欢迎各位佬友提交自己的 `-community` 插件 PR，一起丰富纯 SSH 远程工作台生态！

> **真诚、友善、团结、专业，共建你我引以为荣之社区 —— [https://linux.do](https://linux.do)**

---

## 开源协议

[MIT License](LICENSE)
