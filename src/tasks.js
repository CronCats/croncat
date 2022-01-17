require('dotenv').config()
const contractAbi = require('../src/contract_abi.json')
import { utils } from 'near-api-js'
import axios from 'axios'
import Big from 'big.js'
import NearProvider from './near'
import chalk from 'chalk'
import slack from './slack'

const log = console.log
export const env = process.env.NODE_ENV || 'development'
export const near_env = process.env.NEAR_ENV || 'testnet'
export const LOG_LEVEL = process.env.LOG_LEVEL || 'info'
export const WAIT_INTERVAL_MS = process.env.WAIT_INTERVAL_MS ? parseInt(`${process.env.WAIT_INTERVAL_MS}`) : 30000
export const AGENT_ACCOUNT_ID = process.env.AGENT_ACCOUNT_ID || 'croncat-agent'
export const AGENT_MIN_TASK_BALANCE = utils.format.parseNearAmount(`${process.env.AGENT_MIN_TASK_BALANCE || '1'}`) // Default: 1_000_000_000_000_000_000_000_000 (1 NEAR)
export const AGENT_AUTO_REFILL = process.env.AGENT_AUTO_REFILL === 'true' ? true : false
export const AGENT_AUTO_RE_REGISTER = process.env.AGENT_AUTO_RE_REGISTER === 'true' ? true : false
export const BASE_GAS_FEE = 300000000000000
export const BASE_ATTACHED_PAYMENT = 0
export const BASE_REGISTER_AGENT_FEE = '4840000000000000000000'
let agentSettings = {}
let croncatSettings = {}
let agentBalanceCheckIdx = 0

export async function rpcFunction(method, args, isView, gas = BASE_GAS_FEE, amount = BASE_ATTACHED_PAYMENT) {
  const account = args.account || args.account_id || args.agent_account_id || AGENT_ACCOUNT_ID
  const manager = await getCronManager(account, args)
  const params = method === 'unregister' ? {} : removeUnneededArgs(args)
  let res
  if (LOG_LEVEL === 'debug') console.log(account, isView, manager[method], params, gas, amount);

  try {
    res = isView
      ? await manager[method](params)
      : await manager[method]({
        args: params,
        gas,
        amount: utils.format.parseNearAmount(`${amount}`),
      })
  } catch (e) {
    if (e && e.panic_msg) {
      log('\n')
      log('\t' + chalk.red(e.panic_msg.split(',')[0].replace('panicked at ', '').replace(/\'/g, '')))
      log('\n')
    }
    if (LOG_LEVEL === 'debug') console.log('rpcFunction', e);
  }

  if (res && !isView) return res
  if (!res && !isView) log('\n\t' + chalk.green(`${method} Success!`) + '\n')
  if (!res && isView) log(chalk.green(`No response data`))

  if (isView && res) {
    try {
      const payload = typeof res === 'object' ? res : JSON.parse(res)

      if (method === 'get_agent') {
        const balance = await getAgentBalance()
        const formattedBalance = utils.format.formatNearAmount(balance)
        payload.wallet_balance = formattedBalance
      }

      if (payload.balance) {
        payload.reward_balance = utils.format.formatNearAmount(payload.balance)
        delete payload.balance
      }

      log('\n')
      Object.keys(payload).forEach(k => {
        log(`${chalk.bold.white(k.replace(/\_/g, ' '))}: ${chalk.white(payload[k])}`)
      })
      log('\n')
    } catch (ee) {
      log(`${chalk.bold.white(method.replace(/\_/g, ' '))}: ${chalk.white(res)}`)
      if (LOG_LEVEL === 'debug') console.log('rpcFunction view:', ee);
    }
  }

  if (method === 'get_agent') {
    // Check User Balance
    const balance = await getAgentBalance()

    // ALERT USER is their balance is lower than they should be
    if (!balance || balance < 3e24) {
      log(`${chalk.bold.red('Attention!')}: ${chalk.redBright('Please add more funds to your account to continue sending transactions')}`)
      log(`${chalk.bold.red('Current Account Balance:')}: ${chalk.redBright(utils.format.formatNearAmount(balance))}\n`)

      await notifySlack(`*Attention!* Please add more funds to your account to continue sending transactions.\nCurrent Account Balance: *${utils.format.formatNearAmount(balance)}*`)
    }
  }
}

export async function runTaskTick(options = {}) {
  const manager = await getCronManager(null, options)
  const agentId = options.accountId || options.account_id
  let skipThisIteration = false
  let totalTasks = 0
  let previousAgentSettings = {...agentSettings}

  // Logic will trigger on initial run, then every 5th txn
  // NOTE: This is really only useful if the payout account is the same as the agent
  if (AGENT_AUTO_REFILL && agentBalanceCheckIdx === 0) {
    await checkAgentTaskBalance(options)

    // Always ping heartbeat here, checks prefs above
    await pingHeartbeat()
  }
  agentBalanceCheckIdx++
  if (agentBalanceCheckIdx > 5) agentBalanceCheckIdx = 0

  // 1. Check for tasks
  let taskRes
  try {
    // Only get task hashes my agent can execute
    taskRes = await manager.get_agent_tasks({ account_id: agentId })
  } catch (e) {
    log(`${chalk.red('Connection interrupted, trying again soon...')}`)
    if (LOG_LEVEL === 'debug') console.log('rpcFunction', e);
    // Wait, then try loop again.
    setTimeout(() => { runTaskTick(options) }, WAIT_INTERVAL_MS)
    return;
  }
  totalTasks = parseInt(taskRes[0])
  if (taskRes[1] === '0') log(`${chalk.gray(new Date().toISOString())} Available Tasks: ${chalk.red(totalTasks)}, Current Slot: ${chalk.red('Paused')}`)
  else log(`${chalk.gray(new Date().toISOString())} ${chalk.gray('[' + options.networkId.toUpperCase() + ']')} Available Tasks: ${chalk.blueBright(totalTasks)}, Current Slot: ${chalk.yellow(taskRes[1])}`)

  if (LOG_LEVEL === 'debug') console.log('taskRes', taskRes)
  if (totalTasks <= 0) skipThisIteration = true

  try {
    agentSettings = await getAgent(agentId)
  } catch (ae) {
    agentSettings = {}
    // if no status, trigger a delayed retry
    setTimeout(() => { runTaskTick(options) }, WAIT_INTERVAL_MS)
    return;
  }
  // Check agent is active & able to run tasks
  if (!agentSettings || !agentSettings.status || agentSettings.status !== 'Active') {
    log(`Agent Status: ${chalk.white(agentSettings.status)}`)
    skipThisIteration = true
  }

  // Alert if agent changes status:
  if (previousAgentSettings.status !== agentSettings.status) {
    log(`Agent Status: ${chalk.white(agentSettings.status)}`)
    await notifySlack(`*Agent Status Update:*\nYour agent is now a status of *${agentSettings.status}*`)

    // TODO: At this point we could check if we need to re-register the agent if enough remaining balance, and status went from active to pending or none.
    // NOTE: For now, stopping the process if no agent settings.
    if (!agentSettings.status) process.exit(1)
  }

  // Use agentSettings to check if the maximum missed slots have happened, stop and notify!
  let last_missed_slot = agentSettings.last_missed_slot;
  if (last_missed_slot !== 0) {
    if (last_missed_slot > (parseInt(taskRes[1]) + (croncatSettings.agents_eject_threshold * croncatSettings.slot_granularity))) {
      log(`${chalk.red('Agent has been ejected! Too many slots missed!')}`)
      await notifySlack(`*Agent has been ejected! Too many slots missed!*`)
      process.exit(1);
    }
  }

  // 2. Sign task and submit to chain
  if (!skipThisIteration) {
    try {
      const res = await manager.proxy_call({
        args: {},
        gas: BASE_GAS_FEE,
        amount: BASE_ATTACHED_PAYMENT,
      })
      if (LOG_LEVEL === 'debug') console.log(res)
      // log(`${chalk.yellowBright('TX:' + res.transaction_outcome.id)}`)
    } catch (e) {
      if (LOG_LEVEL === 'debug') console.log('proxy_call issue', e)
      // Check if the agent should slow down to wait for next slot opportunity
      if (e.type && e.type === 'FunctionCallError') {
        // Check if we need to skip iteration based on max calls in this slot, so we dont waste more fees.
        if (e.kind.ExecutionError.search('Agent has exceeded execution for this slot') > -1) {
          skipThisIteration = true
        }
      }
    }
  }

  // Wait, then loop again.
  // Run immediately if executed tasks remain for this slot, then sleep until next slot.
  const nextAttemptInterval = skipThisIteration ? WAIT_INTERVAL_MS : 100
  setTimeout(() => { runTaskTick(options) }, nextAttemptInterval)
}
