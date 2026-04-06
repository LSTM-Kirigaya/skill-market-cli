# Skill Market CLI

A command-line tool for managing skills on Skill Market.

## Installation

```bash
npm install -g skill-market-cli
# or
npx skill-market-cli
```

## Quick Start

```bash
# Login
skill-market-cli login

# List all skills
skill-market-cli list

# List your skills
skill-market-cli list --my

# Upload a new skill
skill-market-cli upload ./my-skill

# Collect AI responses for examples
skill-market-cli run-example ./my-skill --model claude-3-5-sonnet

# Update a skill
skill-market-cli update <skill-id> --file ./my-skill/SKILL.md

# Delete a skill
skill-market-cli delete <skill-id>
```

## Commands

### `login`

Login to Skill Market using OAuth.

```bash
skill-market-cli login
```

### `logout`

Logout and revoke access token.

```bash
skill-market-cli logout
```

### `list`

List skills on the market.

```bash
skill-market-cli list
skill-market-cli list --my          # Show only your skills
skill-market-cli list --json        # Output as JSON
skill-market-cli list -p 2 -s 10    # Page 2, 10 items per page
```

### `upload`

Upload a new skill.

```bash
skill-market-cli upload ./my-skill
skill-market-cli upload ./my-skill/SKILL.md --name "my-skill" --tags "tag1,tag2"
```

### `run-example`

Run user examples and collect AI responses.

```bash
skill-market-cli run-example ./my-skill --model claude-3-5-sonnet
```

This command:
1. Reads your SKILL.md
2. Runs each example through the specified AI model
3. Collects thinking steps, tool calls, and messages
4. Saves to `.skill-examples.json`

### `update`

Update an existing skill.

```bash
skill-market-cli update <skill-id> --file ./my-skill/SKILL.md
```

### `delete`

Delete a skill.

```bash
skill-market-cli delete <skill-id>
skill-market-cli delete <skill-id> --force  # Skip confirmation
```

### `guide`

Show skill upload guide.

```bash
skill-market-cli guide
```

## Configuration

Configuration is stored in `~/.skill-market-cli/config.json`.

## License

MIT
