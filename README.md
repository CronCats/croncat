# Crond JS & CLI

Crond CLI is a Node.js application that relies on [`near-api-js`](https://github.com/near/near-api-js) to generate secure keys, connect to the NEAR platform and send transactions to the network on your behalf.

> note that **Node.js version 10+** is required to run Crond CLI

## Docker Installation & Setup

TBD

## CLI Installation

```bash
npm install -g crond-js
```

### Commands

For a list of up-to-date commands, run `crond --help` in your terminal.

```bash
Usage: crond <command> [options]

Commands:
  crond register <accountId> <payableAccountId>  Add your agent to cron known agents
  crond update <accountId> <payableAccountId>    Update your agent to cron known agents
  crond unregister <accountId>                   Account to remove from list of active agents.
  crond withdraw <accountId>                     Withdraw all rewards earned for this account
  crond status <accountId>                       Check agent status and balance for this account
```