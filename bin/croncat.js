require('dotenv').config()
const chalk = require('chalk')
const yargs = require('yargs')
import getConfig from '../src/configuration'
const { agentFunction, bootstrapAgent, runAgentTick } = require('../src/actions')

const registerAgent = {
  command: 'register <accountId> <payableAccountId>',
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
  handler: async options => {
    await agentFunction('register_agent', options);
  }
};

const updateAgent = {
  command: 'update <accountId> <payableAccountId>',
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
  handler: async options => {
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
  handler: async options => {
    await agentFunction('unregister_agent', options)
  }
};

const withdrawBalance = {
  command: 'withdraw <accountId>',
  desc: 'Withdraw all rewards earned for this account',
  builder: (yargs) => yargs
    .option('accountId', {
      desc: 'Account that earned rewards.',
      type: 'string',
      required: true
    }),
  handler: async options => {
    await agentFunction('withdraw_task_balance', options);
  }
};

const status = {
  command: 'status <accountId>',
  desc: 'Check agent status and balance for this account',
  builder: (yargs) => yargs
    .option('accountId', {
      desc: 'Account to check',
      type: 'string',
      required: true
    }),
  handler: async options => {
    await agentFunction('get_agent', options, true);
  }
};

const tasks = {
  command: 'tasks',
  desc: 'Check how many tasks are available',
  builder: (yargs) => yargs,
  handler: async options => {
    await agentFunction('get_tasks', options, true);
  }
};

const go = {
  command: 'go <accountId>',
  desc: 'Run tasks that are available, if agent is registered and has balance',
  builder: (yargs) => yargs,
  handler: async options => {
    await bootstrapAgent(options.accountId)

    // MAIN AGENT LOOP
    runAgentTick()
  }
};

const config = getConfig(process.env.NODE_ENV || 'development')
yargs // eslint-disable-line
  .strict()
  .scriptName('croncat')
  .middleware(require('../cli/check-version'))
  .middleware(require('../cli/print-options'))
  .option('verbose', {
    desc: 'Prints out verbose output',
    type: 'boolean',
    alias: 'v',
    default: false
  })
  .option('nodeUrl', {
    desc: 'NEAR node URL',
    type: 'string',
    default: config.nodeUrl
  })
  .option('networkId', {
    desc: 'NEAR network ID, allows using different keys based on network',
    type: 'string',
    default: config.networkId
  })
  .option('helperUrl', {
    desc: 'NEAR contract helper URL',
    type: 'string',
  })
  .option('walletUrl', {
    desc: 'Website for NEAR Wallet',
    type: 'string'
  })
  .option('explorerUrl', {
    hidden: true,
    desc: 'Base url for explorer',
    type: 'string',
  })
  .command(registerAgent)
  .command(updateAgent)
  .command(unregisterAgent)
  .command(withdrawBalance)
  .command(status)
  .command(tasks)
  .command(go)
  .config(config)
  .showHelpOnFail(true)
  .recommendCommands()
  .demandCommand(1, chalk`Pass {bold --help} to see all available commands and options.`)
  .usage(chalk`Usage: {bold $0 <command> [options]}`)
  .epilogue(chalk`More info: {bold https://cron.cat}`)
  .wrap(null)
  .argv;
