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
  croncat go <accountId>                           Run tasks that are available, if agent is registered and has balance
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

## Customization & Environment Variables

Sometimes you want to run croncat with notifications and uptime monitoring, or configure the different settings.
To do this, you need to run the following command:

```bash
cp .env.example .env
```

You can then configure the following:

```bash
NODE_ENV=production
NEAR_ENV=mainnet
LOG_LEVEL=info

# The account registered as an agent
AGENT_ACCOUNT_ID=YOUR_ACCOUNT.near
# the NEAR amount to trigger a notification (example here: 1 Near)
AGENT_MIN_TASK_BALANCE=1
# When balance is empty, will auto-withdraw rewards to cover signing txns, withdraws the payout account.
AGENT_AUTO_REFILL=true

# The interval to wait between checking for tasks. Good intervals are below 60 seconds and above 10 seconds.
WAIT_INTERVAL_MS=450000

## Notify slack when events happen
SLACK_TOKEN=YOUR_WEBHOOK_TOKEN
SLACK_CHANNEL=general

# If you have an external heartbeat service that just needs a ping (GET request)
HEARTBEAT=false
HEARTBEAT_URL=GET_REQUEST_URL_FOR_STATUS_SERVICE
```

## Development & Local Testing

To develop, you will need to:

1. `npm i` or `yarn`
2. `npm run dev` or `yarn dev`

For local testing: `npm start` or `yarn start`

You can also test against other networks: `NODE_ENV=production yarn start` which is the same as `NODE_ENV=mainnet yarn start`

#### Local CLI testing

To test methods, utilize local execution with the command syntax:

```
node bin/croncat COMMAND ARGS
```

Example:

```
node bin/croncat tasks
```

## Deploy

Croncat CLI is available via npm, which auto-publishes every update to master.

For deploying docker, simply do the following commands:

```bash
npm run build:cli
npm run docker:build
docker tag croncat/agent:latest
docker push croncat/agent:latest
```