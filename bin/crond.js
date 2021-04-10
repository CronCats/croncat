require('dotenv').config()
const chalk = require('chalk')
const yargs = require('yargs')
import { agentFunction } from '../src/actions'

const chalk = require('chalk');

const registerAgent = {
  command: 'register <accountId>',
  desc: 'Add your agent to cron known agents',
  builder: (yargs) => yargs
    .option('accountId', {
      desc: 'Account to add',
      type: 'string',
      required: true
    })
    .option('payableAccountId', {
      desc: 'Account that receives reward payouts',
      type: 'string',
      required: false
    }),
  handler: async function (options) {
    await agentFunction('register_agent', options);
  }
};

const updateAgent = {
  command: 'update <accountId>',
  desc: 'Update your agent to cron known agents',
  builder: (yargs) => yargs
    .option('accountId', {
      desc: 'Account to add',
      type: 'string',
      required: true
    })
    .option('payableAccountId', {
      desc: 'Account that receives reward payouts',
      type: 'string',
      required: false
    }),
  handler: async function (options) {
    await agentFunction('update_agent', options);
  }
};

const unregisterAgent = {
  command: 'unregister <accountId>',
  desc: 'Account to remove from list of active agents.',
  builder: (yargs) => yargs
    .option('accountId', {
      desc: 'Account to remove.',
      type: 'string',
      required: true
    }),
  handler: async function (options) {
    await agentFunction('unregister_agent', options)
  }
};

const withdrawBalance = {
  command: 'update <accountId>',
  desc: 'Withdraw all rewards earned for this account',
  builder: (yargs) => yargs
    .option('accountId', {
      desc: 'Account that earned rewards.',
      type: 'string',
      required: true
    }),
  handler: async function (options) {
    await agentFunction('withdraw_task_balance', options);
  }
};

let config = require('../src/config').getConfig(process.env.NODE_ENV || 'development');
yargs // eslint-disable-line
    .strict()
    .middleware(require('../cli/check-version'))
    .scriptName('crond')
    .option('verbose', {
        desc: 'Prints out verbose output',
        type: 'boolean',
        alias: 'v',
        default: false
    })
    .middleware(require('../src/print-options'))
    .command(registerAgent)
    .command(updateAgent)
    .command(unregisterAgent)
    .command(withdrawBalance)
    .config(config)
    .showHelpOnFail(true)
    .recommendCommands()
    .demandCommand(1, chalk`Pass {bold --help} to see all available commands and options.`)
    .usage(chalk`Usage: {bold $0 <command> [options]}`)
    .epilogue(chalk`More info: {bold https://cron.cat}`)
    .wrap(null)
    .argv;
