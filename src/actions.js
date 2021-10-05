require('dotenv').config()
const contractAbi = require('../src/contract_abi.json')
import { utils } from 'near-api-js'
import Big from 'big.js'
import NearProvider from './near'
import chalk from 'chalk'
import slack from './slack'

const log = console.log
export const env = process.env.NODE_ENV || 'development'
export const LOG_LEVEL = process.env.LOG_LEVEL || 'info'
export const WAIT_INTERVAL_MS = process.env.WAIT_INTERVAL_MS ? parseInt(`${process.env.WAIT_INTERVAL_MS}`) : 30000
export const AGENT_ACCOUNT_ID = process.env.AGENT_ACCOUNT_ID || 'croncat-agent'
export const AGENT_MIN_TASK_BALANCE = utils.format.parseNearAmount(`${process.env.AGENT_MIN_TASK_BALANCE || '1'}`) // Default: 1_000_000_000_000_000_000_000_000 (1 NEAR)
export const AGENT_AUTO_REFILL = process.env.AGENT_AUTO_REFILL === 'true' ? true : false
export const BASE_GAS_FEE = 300000000000000
export const BASE_ATTACHED_PAYMENT = 0
export const BASE_REGISTER_AGENT_FEE = utils.format.parseNearAmount('1')
let agentSettings = {}
let croncatSettings = {}

const slackProvider = new slack({ 'slackToken': process.env.SLACK_TOKEN })
const notifySlack = text => {
  if (process.env.SLACK_TOKEN) return slackProvider.send({
    slackChannel: process.env.SLACK_CHANNEL,
    text
  })
}

function removeUneededArgs(obj) {
  const allowed = ['agent_account_id', 'payable_account_id', 'account', 'offset', 'accountId', 'payableAccountId']
  const fin = {}

  Object.keys(obj).forEach(k => {
    if (allowed.includes(k)) fin[k] = obj[k]
  })

  return fin
}

export const Near = new NearProvider({
  networkId: env === 'production' ? 'mainnet' : 'testnet',
  accountId: AGENT_ACCOUNT_ID,
})
let cronManager = null
let agentAccount = null

export async function connect(options) {
  try {
    await Near.getNearConnection(options)
  } catch (e) {
    log(`${chalk.red('NEAR Connection Failed')}`)
    process.exit(1)
  }
}

export async function getCronManager(accountId, options) {
  if (cronManager) return cronManager
  await connect(options)
  const _n = Near
  const abi = contractAbi.abis.manager
  const contractId = contractAbi[env].manager
  if (accountId) _n.accountId = accountId
  cronManager = await _n.getContractInstance(contractId, abi)
  return cronManager
}

// NOTE: Optional "payable_account_id" here
export async function registerAgent(agentId, payable_account_id, options) {
  const account = agentId || AGENT_ACCOUNT_ID
  const manager = await getCronManager(account, options)

  try {
    const res = await manager.register_agent({
      args: { agent_account_id: account, payable_account_id },
      gas: BASE_GAS_FEE,
      amount: BASE_REGISTER_AGENT_FEE,
    })
    log(`Registered Agent: ${chalk.blue(account)}`)
  } catch (e) {
    if(e.type === 'KeyNotFound') {
      log(`${chalk.red('Agent Registration Failed:')} ${chalk.bold.red(`Please login to your account '${account}' and try again.`)}`)
    } else {
      log(`${chalk.red('Agent Registration Failed:')} ${chalk.bold.red('Please remove your credentials and try again.')}`)
    }
    process.exit(1)
  }
}

export async function getAgent(agentId, options) {
  const manager = await getCronManager(null, options)
  try {
    const res = await manager.get_agent({ account: agentId || agentAccount })
    return res
  } catch (ge) {
    if (LOG_LEVEL === 'debug') console.log(ge);
  }
}

export async function getCroncatInfo(options) {
  const manager = await getCronManager(null, options)
  try {
    const res = await manager.get_info()

    return {
      paused: res[0],
      owner_id: res[1],
      agent_active_queue: res[2],
      agent_pending_queue: res[3],
      agent_task_ratio: res[4],
      agents_eject_threshold: res[5],
      slots: res[6],
      tasks: res[7],
      available_balance: res[8],
      staked_balance: res[9],
      agent_fee: res[10],
      gas_price: res[11],
      proxy_callback_gas: res[12],
      slot_granularity: res[13],
      agent_storage_usage: res[14],
    }
  } catch (ge) {
    if (LOG_LEVEL === 'debug') console.log(ge);
  }
}

export async function checkAgentBalance(agentId) {
  const balance = await Near.getAccountBalance()
  const formattedBalance = utils.format.formatNearAmount(balance)
  const hasEnough = Big(balance).gt(BASE_GAS_FEE)
  log(`
    Agent Account: ${chalk.white(agentId || AGENT_ACCOUNT_ID)}
    Agent Balance: ${!hasEnough ? chalk.red(formattedBalance) : chalk.green(formattedBalance)}
  `)
  if (!hasEnough) {
    log(`
      ${chalk.red('Your agent account does not have enough to pay for signing transactions.')}
      Use the following steps:
      ${chalk.bold.white('1. Copy your account id: ')}${chalk.underline.white(agentId || AGENT_ACCOUNT_ID)}
      ${chalk.bold.white('2. Use the web wallet to send funds: ')}${chalk.underline.blue(Near.config.walletUrl + '/send-money')}
      ${chalk.bold.white('3. Use NEAR CLI to send funds: ')} "near send OTHER_ACCOUNT ${AGENT_ACCOUNT_ID} ${(Big(BASE_GAS_FEE).mul(4))}"
    `)
    process.exit(1)
  }
}

export async function checkAgentTaskBalance(options) {
  const balance = await Near.getAccountBalance()
  const notEnough = Big(balance).lt(AGENT_MIN_TASK_BALANCE)
  if (notEnough) {
    log(`
      ${chalk.red('Agent is running low on funds, attempting to refill from rewards...')}
    `)
    await refillAgentTaskBalance(options)
  }
}

export async function refillAgentTaskBalance(options) {
  try {
    const manager = await getCronManager(null, options)
    const res = await manager.withdraw_task_balance({
      args: {},
      gas: BASE_GAS_FEE,
    })
    const balance = await Near.getAccountBalance()
    log(`Agent Refilled, Balance: ${chalk.blue(utils.format.formatNearAmount(balance))}`)
    notifySlack(`Agent Refilled, Balance: *${utils.format.formatNearAmount(balance)}*`)
  } catch (e) {
    log(`${chalk.red('No balance to withdraw.')}`)
    notifySlack(`*Attention!* No balance to withdraw.`)
    process.exit(1)
  }
}

let agentBalanceCheckIdx = 0
export async function runAgentTick(options) {
  const manager = await getCronManager(null, options)
  const agentId = options.accountId || options.account_id
  let skipThisIteration = false
  let tasks = []

  // Logic will trigger on initial run, then every 5th txn
  // NOTE: This is really only useful if the payout account is the same as the agent
  if (AGENT_AUTO_REFILL && agentBalanceCheckIdx === 0) {
    await checkAgentTaskBalance(options)
  }
  agentBalanceCheckIdx++
  if (agentBalanceCheckIdx > 5) agentBalanceCheckIdx = 0

  // 1. Check for tasks
  let taskRes
  try {
    // Only get task hashes my agent can execute
    taskRes = await manager.get_tasks({ account_id: agentId })
  } catch (e) {
    log(`${chalk.red('Connection interrupted, trying again soon...')}`)
    // Wait, then try loop again.
    setTimeout(() => { runAgentTick() }, WAIT_INTERVAL_MS)
    return;
  }
  tasks = taskRes[0].filter(v => !!v)
  log(`${chalk.gray(new Date().toISOString())} Available Tasks: ${chalk.blueBright(tasks.length)}, Current Slot: ${chalk.yellow(taskRes[1])}`)
  if (LOG_LEVEL === 'debug') console.log('taskRes', taskRes)
  if (!tasks || tasks.length <= 0) skipThisIteration = true

  agentSettings = await getAgent(agentId)
  // Check agent is active & able to run tasks
  if (agentSettings.status !== 'Active') {
    log(`Agent Status: ${chalk.white('Pending')}`)
    skipThisIteration = true
  }
  
  // Use agentSettings to check how many executions are allowed per slots
  // Also check if the current slot is not the same as this slot, so we can skip and attempt if there is new.
  // slot_execs: [ 65985600, 1 ]
  // taskRes: [ [], '65985600' ]
  if (agentSettings.slot_execs[0] <= parseInt(taskRes[1])) {
    const slotTotalTasks = Math.floor(croncatSettings.agent_task_ratio[0] / croncatSettings.agent_task_ratio[1])
    if (agentSettings.slot_execs[1] >= slotTotalTasks) {
      log(`Agent Slot Task Total: ${chalk.white(agentSettings.slot_execs[1])}`)
      skipThisIteration = true
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
      if (LOG_LEVEL === 'debug') console.log(e)
      // if (e.type && e.type === 'FunctionCallError') console.log('runAgentTick res', e.kind.ExecutionError);
    }
  }

  // Wait, then loop again.
  // Run immediately if executed tasks remain for this slot, then sleep until next slot.
  const nextAttemptInterval = skipThisIteration ? WAIT_INTERVAL_MS : 100
  setTimeout(() => { runAgentTick() }, nextAttemptInterval)
}

export async function agentFunction(method, args, isView, gas = BASE_GAS_FEE, amount = BASE_ATTACHED_PAYMENT) {
  const account = args.account || args.agent_account_id || AGENT_ACCOUNT_ID
  const manager = await getCronManager(account, args)
  const params = method === 'unregister' ? {} : removeUneededArgs(args)
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
  }

  if (res && !isView) return res
  if (!res && !isView) log('\n\t' + chalk.green(`${method} Success!`) + '\n')
  if (!res && isView) log(chalk.green(`No response data`))

  if (isView && res) {
    try {
      const payload = typeof res === 'object' ? res : JSON.parse(res)
      log('\n')
      Object.keys(payload).forEach(k => {
        const value = k === 'balance' ? utils.format.formatNearAmount(payload[k]) : payload[k]
        log(`${chalk.bold.white(k.replace(/\_/g, ' '))}: ${chalk.white(value)}`)
      })
      log('\n')
    } catch (ee) {
      log(`${chalk.bold.white(method.replace(/\_/g, ' '))}: ${chalk.white(res)}`)
    }
  }

  if (method === 'get_agent') {
    // Check User Balance
    const balance = await Near.getAccountBalance()

    // ALERT USER is their balance is lower than they should be
    if (!balance || balance < 1e25) {
      log(`${chalk.bold.red('Attention!')}: ${chalk.redBright('Please add more funds to your account to continue sending transactions')}`)
      log(`${chalk.bold.red('Current Account Balance:')}: ${chalk.redBright(utils.format.formatNearAmount(balance))}\n`)

      notifySlack(`*Attention!* Please add more funds to your account to continue sending transactions.\nCurrent Account Balance: *${utils.format.formatNearAmount(balance)}*`)
    }
  }
}

export async function bootstrapAgent(agentId, options) {
  await connect(options)

  // 1. Check for local signing keys, if none - generate new and halt until funded
  agentAccount = `${await Near.getAccountCredentials(agentId || AGENT_ACCOUNT_ID)}`

  // 2. Check for balance, if enough to execute txns, start main tasks
  await checkAgentBalance(agentId)

  // 3. Check if agent is registered, if not register immediately before proceeding
  try {
    agentSettings = await getAgent(agentId)
    if (!agentSettings) {
      log(`No Agent: ${chalk.red('Please register')}`)
      process.exit(0);
    }
    log(`Verified Agent: ${chalk.white(agentId || AGENT_ACCOUNT_ID)}`)
    croncatSettings = await getCroncatInfo(options)
    if (!croncatSettings) {
      log(`No Croncat Deployed At this Network`)
      process.exit(0);
    }
  } catch (e) {
    log(`No Agent: ${chalk.gray('Please register')}`)
    // await registerAgent(agentId)
  }
}