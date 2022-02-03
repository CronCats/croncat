import * as config from './configuration'
import * as util from './util'
import { utils } from 'near-api-js'
import Big from 'big.js'
import chalk from 'chalk'

let croncatSettings = null
let agentSettings = {}
let agentAccount = null

export async function getAgentBalance() {
  try {
    const balance = await util.Near.getAccountBalance()
    return balance
  } catch (e) {
    console.log(`${chalk.red('NEAR RPC Failed')}`)
    await notifySlack(`*Attention!* NEAR ${near_env} RPC Failed to retrieve balance!`)
    process.exit(1)
  }
}

// NOTE: Optional "payable_account_id" here
export async function registerAgent(agentId, payable_account_id) {
  const account = agentId || config.AGENT_ACCOUNT_ID
  const manager = await util.getCronManager(account)

  try {
    const res = await manager.register_agent({
      args: { payable_account_id: payable_account_id || account },
      gas: config.BASE_GAS_FEE,
      amount: config.BASE_REGISTER_AGENT_FEE,
    })
    console.log(`Registered Agent: ${chalk.blue(account)}`)
    util.dbug('REGISTER ARGS', res);
  } catch (e) {
    util.dbug(e);
    if(e.type === 'KeyNotFound') {
      console.log(`${chalk.red('Agent Registration Failed:')} ${chalk.bold.red(`Please login to your account '${account}' and try again.`)}`)
    } else {
      console.log(`${chalk.red('Agent Registration Failed:')} ${chalk.bold.red('Please remove your credentials and try again.')}`)
    }
    process.exit(1)
  }
}

export async function getAgent(agentId = config.AGENT_ACCOUNT_ID) {
  const manager = await util.getCronManager()
  try {
    const res = await manager.get_agent({ account_id: agentId })
    return res
  } catch (ge) {
    util.dbug(ge);
  }
}

export async function checkAgentBalance() {
  const balance = await getAgentBalance()
  const formattedBalance = utils.format.formatNearAmount(balance)
  const hasEnough = Big(balance).gt(config.BASE_GAS_FEE)
  console.log(`Agent Account: ${chalk.white(config.AGENT_ACCOUNT_ID)}
Agent Balance: ${!hasEnough ? chalk.red(formattedBalance) : chalk.green(formattedBalance)}`)
  if (!hasEnough) {
    console.log(`
      ${chalk.red('Your agent account does not have enough to pay for signing transactions.')}
      Use the following steps:
      ${chalk.bold.white('1. Copy your account id: ')}${chalk.underline.white(config.AGENT_ACCOUNT_ID)}
      ${chalk.bold.white('2. Use the web wallet to send funds: ')}${chalk.underline.blue(util.Near.config.walletUrl + '/send-money')}
      ${chalk.bold.white('3. Use NEAR CLI to send funds: ')} "near send OTHER_ACCOUNT ${config.AGENT_ACCOUNT_ID} ${(Big(config.BASE_GAS_FEE).mul(4))}"
    `)
    process.exit(0)
  }
}

export async function checkAgentTaskBalance() {
  const balance = await getAgentBalance()
  const notEnough = Big(balance).lt(config.AGENT_MIN_TASK_BALANCE)
  if (notEnough) {
    console.log(`
      ${chalk.red('Agent is running low on funds, attempting to refill from rewards...')}
    `)
    await refillAgentTaskBalance()
  }
}

export async function refillAgentTaskBalance() {
  try {
    const manager = await util.getCronManager()
    await manager.withdraw_task_balance({ args: {}, gas: config.BASE_GAS_FEE })
    const balance = await getAgentBalance()
    const notEnough = Big(balance).lt(config.AGENT_MIN_TASK_BALANCE)
    if (notEnough) {
      console.log(`${chalk.red('Balance too low.')}`)
      await notifySlack(`*Attention!* Not enough balance to execute tasks, refill please.`)
      process.exit(1)
    } else {
      console.log(`Agent Refilled, Balance: ${chalk.blue(utils.format.formatNearAmount(balance))}`)
      await notifySlack(`Agent Refilled, Balance: *${utils.format.formatNearAmount(balance)}*`)
    }
  } catch (e) {
    console.log(`${chalk.red('No balance to withdraw.')}`)
    await notifySlack(`*Attention!* No balance to withdraw.`)
    process.exit(1)
  }
}

let agentBalanceCheckIdx = 0
export const pingAgentBalance = async () => {
  // Logic will trigger on initial run, then every 5th txn
  // NOTE: This is really only useful if the payout account is the same as the agent
  if (config.AGENT_AUTO_REFILL && agentBalanceCheckIdx === 0) {
    await checkAgentTaskBalance()

    // Always ping heartbeat here, checks config
    await util.pingHeartbeat()
  }
  agentBalanceCheckIdx++
  if (agentBalanceCheckIdx > 5) agentBalanceCheckIdx = 0
}

// Checks if need to re-register agent based on tasks getting missed
export const reRegisterAgent = async () => {
  if (!config.AGENT_AUTO_RE_REGISTER) process.exit(1)
  await registerAgent()
}

export const currentStatus = () => {
  return agentSettings.status || 'Pending'
}

// returns if agent is active or not
export const checkStatus = async () => {
  let isActive = false
  let previousAgentSettings = { ...agentSettings }

  try {
    agentSettings = await agent.getAgent()
  } catch (ae) {
    agentSettings = {}
    // if no status, trigger a delayed retry
    return isActive
  }
  // Check agent is active & able to run tasks
  if (!agentSettings || !agentSettings.status || agentSettings.status !== 'Active') {
    console.log(`Agent Status: ${chalk.white(agentSettings.status)}`)
  }

  // Alert if agent changes status:
  if (previousAgentSettings.status !== agentSettings.status) {
    console.log(`Agent Status: ${chalk.white(agentSettings.status)}`)
    await util.notifySlack(`*Agent Status Update:*\nYour agent is now a status of *${agentSettings.status}*`)

    // At this point we could check if we need to re-register the agent if enough remaining balance, and status went from active to pending or none.
    if (!agentSettings.status) return reRegisterAgent()
  }

  // Use agentSettings to check if the maximum missed slots have happened, stop and notify!
  let last_missed_slot = agentSettings.last_missed_slot;
  if (last_missed_slot !== 0) {
    if (last_missed_slot > (parseInt(taskRes[1]) + (croncatSettings.agents_eject_threshold * croncatSettings.slot_granularity))) {
      const ejectMsg = 'Agent has been ejected! Too many slots missed!'
      console.log(`${chalk.red(ejectMsg)}`)
      await util.notifySlack(`*${ejectMsg}*`)
      // Assess if re-register
      return reRegisterAgent()
    }
  }

  return true
}

// Is this all i need to do? kinda seemed too easy... ROFL
export async function run() {
  await checkStatus()
  await pingAgentBalance()
  // Wait, then loop again.
  setTimeout(run, config.WAIT_INTERVAL_MS)
}

// Initialize the agent & all configs, returns TRUE if agent is active
export async function bootstrap() {
  await util.connect()
  const agentId = config.AGENT_ACCOUNT_ID

  // 1. Check for local signing keys, if none - generate new and halt until funded
  agentAccount = `${await util.Near.getAccountCredentials(agentId)}`

  // 2. Check for balance, if enough to execute txns, start main tasks
  await checkAgentBalance()

  // 3. Check if agent is registered, if not register immediately before proceeding
  let requiresRegister = false
  try {
    agentSettings = await getAgent(agentId)
    if (!agentSettings) {
      if (config.AGENT_AUTO_RE_REGISTER) {
        requiresRegister = true
      } else {
        console.log(`No Agent: ${chalk.red('Please register')}`)
        process.exit(0);
      }
    } else {
      console.log(`${chalk.gray('Registered Agent: ')}${chalk.white(agentId)}`)
    }
    croncatSettings = await util.getCroncatInfo()
    if (!croncatSettings) {
      console.log(`No Croncat Deployed At this Network`)
      process.exit(1);
    }
  } catch (e) {
    util.dbug(e);
    if (config.AGENT_AUTO_RE_REGISTER) requiresRegister = true
    else console.log(`No Agent: ${chalk.red('Please register')}`)
  }

  if (requiresRegister === true) {
    console.log(`No Agent: ${chalk.gray('Attempting to register...')}`)
    await registerAgent(agentId)
  }

  console.log(`${chalk.gray('Agent Status: ')}${chalk.white(agentSettings.status)}`)
  if (agentSettings.status === 'Pending') console.log(`${chalk.yellow('Agent waiting until croncat manager changes agent status to Active...')}\n${chalk.gray('Do not stop this process unless you are done being a croncat agent, see https://cron.cat/tasks for more info')}`)

  return agentSettings && agentSettings.status === 'Active' ? true : false
}