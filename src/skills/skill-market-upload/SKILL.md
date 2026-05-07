---
name: skill-market-upload
purpose: 指导 AI Agent 使用 skill-market-cli 将本地 SKILL 上传至 Skill Market，含用户案例与轨迹采集要求
tags:
  - skill-market
  - cli
  - upload
model: claude-sonnet-4-6
rootUrl: https://raw.githubusercontent.com/LSTM-Kirigaya/skill-market-cli/refs/heads/main/src/skills/skill-market-upload/SKILL.md
---

# Skill Market 上传助手（给 AI Agent 用）

本说明面向 **代表用户操作终端的 AI Agent**。目标：在已登录 `skill-market-cli` 的前提下，通过 **`skill-market-cli upload`** 完成上传，并满足服务端对 **AI 渠道** 的必填规则。

## 你必须知道的约束

1. **检查登录状态**：在上传之前，必须先确认用户已登录 `skill-market-cli`。凭证保存在 `~/.skill-market-cli/config.json`。
   - 如果用户尚未登录，必须告知用户以下两种登录方式，并等待用户完成登录后再继续上传：
     - **方法 1**：在命令行运行 `skill-market-cli login`
     - **方法 2**：打开 https://kirigaya.cn/profile/tokens ，自己创建 Personal Access Token，然后运行 `skill-market-cli token set <your-token>`
2. **上传走 AI 渠道**：CLI 使用 `POST /api/skill/ai/upload`，要求 **全部字段非空**，且 **`tags`、`usageExamples` 不得为空数组**。
3. **模型字段**：`model` 字段必须填写你当前实际使用的模型名称（如 `claude-sonnet-4-6`、`claude-opus-4-7` 等），**禁止**使用 `deepseek-chat` 作为默认值。这个字段代表该 Skill 推荐使用的模型，应与实际运行环境一致。
4. **标签管理（重要）**：在上传前，**必须**通过标签 API 搜索和管理标签，避免创建语义相近的重复 tag：
   - **搜索标签**：`GET /api/skill/tags/search?keyword=xxx` — 按关键词搜索已有标签（支持中英文）
   - **创建标签**：`POST /api/skill/tags/create` body: `{"nameZh":"中文名","nameEn":"EnglishName"}` — 创建新标签（需超级用户权限）
   - **列出所有标签**：`GET /api/skill/tags` — 获取全部已有标签
   - 工作流：先搜索 → 从结果中挑选匹配的 → 若无匹配则创建新标签 → 将选中的标签名填入 `tags` 字段
5. **用户案例（必填）**：`usageExamples` 中每一项必须包含：
   - **`prompt`**：终端用户会如何向该 Skill 提问（由用户或你根据上下文代写，但必须经用户确认）。
   - **`aiResponses`**：一次「示例运行」采集到的轨迹（thinking / toolcall / message）。上传命令会在本地 **自动调用采集逻辑** 生成（当前为可替换的模拟实现，结构需与后端一致）。
   - **`model`**：推荐模型名（应与第 3 条的模型字段一致）。
6. **无法仅从文件推断的字段**：若 SKILL.md 未写全，上传流程会 **交互询问**：名称、描述、标签、`rootUrl`、推荐模型等。Agent 应结合仓库上下文、README、用户口述 **帮用户预填**，并在询问环节确认。

## 推荐工作流（Agent）

1. **确认登录状态**：
   - 读取 `~/.skill-market-cli/config.json` 或通过 `skill-market-cli token get` 检查是否存在有效凭证。
   - 若未登录，向用户说明两种登录方式（`skill-market-cli login` 或前往 https://kirigaya.cn/profile/tokens 创建 token），并在用户完成登录后继续。
2. 确认仓库中存在 **`SKILL.md`**（目录则路径指向该目录）。
3. 读取 frontmatter，整理候选：`name`、`purpose`/`description`、`tags`、`model`、`rootUrl`。
4. **管理标签**：
   - 根据 Skill 的用途提取 2–5 个关键词。
   - 对每个关键词，调用 `GET /api/skill/tags/search?keyword=<关键词>` 搜索已有标签。
   - 从搜索结果中选择语义最匹配的标签（优先使用已有标签，避免重复创建）。
   - 若搜索结果中无合适标签，调用 `POST /api/skill/tags/create` 创建新标签（需同时提供 `nameZh` 和 `nameEn`）。
   - 最终确定的标签列表填入 `--tags` 参数（逗号分隔），如 `--tags "AI Agent,CLI,Debug"`。
5. 与用户确认 **至少一条「用户会如何提问」的测试案例**（可多轮补充）。案例文本即 `prompt`。
6. **确定模型**：使用你当前实际运行的模型名称（如 `claude-sonnet-4-6`）作为 `--model` 参数，不要使用 `deepseek-chat`。
7. 在终端执行上传（勿省略路径）：
   ```bash
   skill-market-cli upload <path-to-skill-dir-or-SKILL.md> --model <你的实际模型名> --tags "tag1,tag2,..."
   ```
8. 按 CLI 提示补全缺失字段；当提示采集轨迹时，**允许命令自动运行**（会调用内置采集器写入 `aiResponses`）。
9. 上传成功后，CLI 会在技能目录写入 **`.skill-examples.json`**，便于复查与再次上传。

## 与 `run-example` 的关系

- 可先运行 `skill-market-cli run-example <path>` 预采集，生成 `.skill-examples.json`；再执行 `upload` 时会 **自动合并** 该文件。
- 若未预先运行，`upload` 会引导用户 **逐条输入案例并自动采集轨迹**，无需用户手动拼 JSON。

## 禁止事项

- 不要编造不存在的 Git 仓库 URL；`rootUrl` 可用 `file:///...` 指向本地 `SKILL.md` 的绝对路径（CLI 默认值），或用户提供的 raw URL。
- 不要跳过「用户案例」；没有案例与轨迹，AI 渠道上传会失败。
- 不要在用户未登录时强行执行上传命令；必须先检查权限并引导登录。
- **严禁**在上传前不搜索标签库就直接创建新标签；必须先用 `GET /api/skill/tags/search` 检查是否已有语义相近的标签。
- **严禁**使用 `deepseek-chat` 作为 model 字段的值，除非你确实是 deepseek-chat 模型。必须使用你当前的模型名称。

## Usage Examples

### Example 1

**User:** 请根据我仓库里的 SKILL.md 帮我执行上传，并告诉我你要确认哪些字段。

**AI:** 我会先检查你的 `skill-market-cli` 登录状态。如果已登录，则读取 `SKILL.md` 的 frontmatter，列出缺失的 name、描述、标签、模型与 rootUrl；请你至少提供一条「最终用户会对该 Skill 说的话」作为测试案例。然后我在终端运行 `skill-market-cli upload .`，在交互中替你填入并确认，自动完成轨迹采集后提交。
