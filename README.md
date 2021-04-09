# Crond JS & CLI

Crond CLI is a Node.js application that relies on [`near-api-js`](https://github.com/near/near-api-js) to generate secure keys, connect to the NEAR platform and send transactions to the network on your behalf.

> note that **Node.js version 10+** is required to run Crond CLI

## Installation

```bash
npm install -g crond-js
```

## Usage

In command line, from the directory with your project:

```bash
crond <command>
```

### Commands

For a list of up-to-date commands, run `crond` in your terminal with no arguments.

#### For account:
```bash
  crond login                 # logging in through NEAR protocol wallet
  crond init                  # create a cron Agent account
  crond run                   # run the crond agent
```