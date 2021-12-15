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
  croncat register <account_id> [payable_account_id]  Add your agent to cron known agents
  croncat update <account_id> [payable_account_id]    Update your agent to cron known agents
  croncat unregister <account_id>                     Account to remove from list of active agents.
  croncat withdraw [account_id]                       Withdraw all rewards earned for this account
  croncat status [account_id]                         Check agent status and balance for this account
  croncat tasks                                       Check how many tasks are currently available
  croncat go [account_id]                             Run tasks that are available, if agent is registered and has balance
  croncat daemon [near_env]                           Generate a network specific croncat daemon service
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
# Helpful if your agent gets kicked after being inactive for any reason. Will attempt to re-register and become a pending agent upon next start.
AGENT_AUTO_RE_REGISTER=false

# The interval to wait between checking for tasks. Good intervals are below 60 seconds and above 10 seconds.
WAIT_INTERVAL_MS=450000

## Notify slack when events happen
SLACK_TOKEN=YOUR_WEBHOOK_TOKEN
SLACK_CHANNEL=general

# If you have an external heartbeat service that just needs a ping (GET request)
HEARTBEAT=false
HEARTBEAT_URL=GET_REQUEST_URL_FOR_STATUS_SERVICE

## -------------------------------------------------------------------
## RPC Providers
## Configure the following as CSV, in priority order, for RPC Failover
## -------------------------------------------------------------------
# Example: RPC_MAINNET_PROVIDERS="https://rpc.mainnet.near.org,http://localhost:3030"
RPC_MAINNET_PROVIDERS="https://mainnet-rpc.openshards.io,https://rpc.mainnet.near.org"
RPC_TESTNET_PROVIDERS="https://rpc.testnet.near.org,https://testnet-rpc.openshards.io"
RPC_GUILDNET_PROVIDERS="https://rpc.openshards.io"
RPC_BETANET_PROVIDERS="https://rpc.betanet.near.org"

## RPC API KEY for providers that require it
RPC_API_KEY=
```

## Croncat Agent DAEMON

To setup an agent that has auto reboot capability, do the following steps:

```bash
# 1. create a service file via daemon command: Example for guildnet, use your desired network
croncat daemon guildnet

# 2. create the service symlink and then enable the service
sudo systemctl link ~/croncat/testnet/croncat_testnet.service
sudo systemctl enable croncat_testnet.service

# 3. reload systemctl
sudo systemctl daemon-reload

# 4. start the service
sudo systemctl start croncat_testnet.service

# 5. for accessing logs, you can use these commands, just make sure to use the right network name
journalctl -f -u croncat_testnet.service
tail -f /var/log/croncat_testnet.log
tail -f /var/log/croncaterror.log
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

Examples:

```
node bin/croncat tasks
node bin/croncat register agent.in.testnet agent.in.testnet
node bin/croncat status agent.in.testnet
node bin/croncat go agent.in.testnet
node bin/croncat withdraw agent.in.testnet
```

## Deploy

Croncat CLI is available via npm, which auto-publishes every update to master.

For deploying docker, simply do the following commands:

```bash
npm run build:cli
npm publish
npm run docker:build
docker tag croncat/agent:latest croncat/agent:1.4.1
docker push croncat/agent:latest
docker push croncat/agent:1.4.1
```