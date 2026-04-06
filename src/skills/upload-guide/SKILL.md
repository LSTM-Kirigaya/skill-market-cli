# Skill Upload Guide

This skill helps you upload skills to the Skill Market using the CLI tool.

## Overview

When uploading a skill, you need to provide:

1. **SKILL.md** - The main skill definition file
2. **Usage Examples** - Demonstrations of how to use the skill
3. **AI Responses** - Expected AI behavior for each example

## File Structure

```
my-skill/
├── SKILL.md              # Required: Main skill file
├── .skill-examples.json  # Generated: Collected AI responses
└── assets/               # Optional: Additional files
```

## SKILL.md Format

```markdown
---
name: my-awesome-skill
purpose: Brief description of what this skill does
tags: ["tag1", "tag2"]
model: claude-3-5-sonnet
---

# My Awesome Skill

Detailed description of the skill...

## Usage Examples

### Example 1
**User:** How do I use this skill?

**AI:** I'll help you use this skill. Here's what you need to do...

### Example 2
**User:** Another example prompt

**AI:** Here's the response...
```

## Collecting AI Responses

Before uploading, you should collect AI responses for your examples:

```bash
# Run examples and collect AI responses
skill-market-cli run-example ./my-skill --model claude-3-5-sonnet

# This will:
# 1. Read your SKILL.md
# 2. Run each example through the AI
# 3. Collect thinking steps, tool calls, and messages
# 4. Save to .skill-examples.json
```

## Uploading

```bash
# Upload with automatic info extraction
skill-market-cli upload ./my-skill

# Or specify details manually
skill-market-cli upload ./my-skill/SKILL.md \
  --name "my-skill" \
  --description "What this skill does" \
  --tags "tag1,tag2" \
  --model "claude-3-5-sonnet"
```

## Best Practices

1. **Clear Examples**: Provide 2-5 clear, diverse usage examples
2. **Complete Responses**: Always run `run-example` to collect full AI responses
3. **Privacy**: The tool will automatically redact sensitive information
4. **Model Spec**: Indicate which model works best with your skill

## Privacy & Security

When collecting AI responses:
- API keys are automatically redacted
- Sensitive domains are masked
- Personal information is removed

You can review the collected data in `.skill-examples.json` before uploading.
