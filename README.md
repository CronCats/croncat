# croncat JS & CLI

croncat CLI is a Node.js application that relies on [`near-api-js`](https://github.com/near/near-api-js) to generate secure keys, connect to the NEAR platform and send transactions to the network on your behalf.

> note that **Node.js version 10+** is required to run croncat CLI

## Docker Installation & Setup

TBD

## CLI Installation

```bash
npm install -g croncat
```

### Commands

For a list of up-to-date commands, run `croncat --help` in your terminal.

```bash
Usage: croncat <command> [options]

Commands:
  croncat register <accountId> <payableAccountId>  Add your agent to cron known agents
  croncat update <accountId> <payableAccountId>    Update your agent to cron known agents
  croncat unregister <accountId>                   Account to remove from list of active agents.
  croncat withdraw <accountId>                     Withdraw all rewards earned for this account
  croncat status <accountId>                       Check agent status and balance for this account
  croncat tasks                                    Check how many tasks are available
```