# croncat JS & CLI

croncat CLI is a Node.js application that relies on [`near-api-js`](https://github.com/near/near-api-js) to generate secure keys, connect to the NEAR platform and send transactions to the network on your behalf.

> note that **Node.js version 10+** is required to run croncat CLI

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
  croncat run                                      Run tasks that are available, if agent is registered and has balance
```

## Docker Installation & Setup

Before running the image make sure you are logged in with near:

```bash
near login
```

This should create the following directory (if it doesn't exist already):

```bash
ls ~/.near-credentials
default testnet
```

Build the image:
```bash
yarn docker:build
```

Run docker in detached mode and set the agent account id:
```bash
docker run --rm -d --env AGENT_ACCOUNT_ID=your_agent.testnet -v ~/.near-credentials:/root/.near-credentials croncat
```

Run the cli:

```bash
docker run --rm -it croncat ./croncat-cli
```

Add an alias for convenience:
```bash
alias croncat="docker run --rm -it croncat ./croncat-cli"
```
This will allow you to run the commands as seen below.

## Development & Local Testing

To develop, you will need to:

1. `npm i` or `yarn`
2. `npm run dev` or `yarn dev`

For local testing: `npm start` or `yarn start`

You can also test against other networks: `NODE_ENV=production yarn start` which is the same as `NODE_ENV=mainnet yarn start`

## Deploy

Croncat CLI is available via npm, which auto-publishes every update to master.

For deploying docker, simply do the following commands:

```bash
npm run build:cli
npm run docker:build
docker tag croncat/agent:latest
docker push croncat/agent:latest
```