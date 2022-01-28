import * as config from './configuration'
import { utils } from 'near-api-js'
import Big from 'big.js'
import chalk from 'chalk'

let croncatSettings = null
let agentSettings = {}
let agentAccount = null

export async function getAgentBalance() {
  try {
    const balance = await Near.getAccountBalance()
    return balance
  } catch (e) {
    log(`${chalk.red('NEAR RPC Failed')}`)
    await notifySlack(`*Attention!* NEAR ${near_env} RPC Failed to retrieve balance!`)
    process.exit(1)
  }
}

// NOTE: Optional "payable_account_id" here
export async function registerAgent(agentId, payable_account_id, options) {
  const account = agentId || AGENT_ACCOUNT_ID
  const manager = await getCronManager(account, options)

  try {
    const res = await manager.register_agent({
      args: { payable_account_id },
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

export async function getAgent(agentId) {
  const manager = await getCronManager()
  try {
    const res = await manager.get_agent({ account_id: agentId })
    return res
  } catch (ge) {
    if (config.LOG_LEVEL === 'debug') console.log(ge);
  }
}

export async function checkAgentBalance(agentId) {
  const balance = await getAgentBalance()
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
    process.exit(0)
  }
}

export async function checkAgentTaskBalance(options) {
  const balance = await getAgentBalance()
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
    const balance = await getAgentBalance()
    const notEnough = Big(balance).lt(AGENT_MIN_TASK_BALANCE)
    if (notEnough) {
      log(`${chalk.red('Balance too low.')}`)
      await notifySlack(`*Attention!* Not enough balance to execute tasks, refill please.`)
      process.exit(1)
    } else {
      log(`Agent Refilled, Balance: ${chalk.blue(utils.format.formatNearAmount(balance))}`)
      await notifySlack(`Agent Refilled, Balance: *${utils.format.formatNearAmount(balance)}*`)
    }
  } catch (e) {
    log(`${chalk.red('No balance to withdraw.')}`)
    await notifySlack(`*Attention!* No balance to withdraw.`)
    process.exit(1)
  }
}

export const pingAgentBalance = async () => {
  // Logic will trigger on initial run, then every 5th txn
  // NOTE: This is really only useful if the payout account is the same as the agent
  if (config.AGENT_AUTO_REFILL && agentBalanceCheckIdx === 0) {
    await agent.checkAgentTaskBalance()

    // Always ping heartbeat here, checks config
    await util.pingHeartbeat()
  }
  agentBalanceCheckIdx++
  if (agentBalanceCheckIdx > 5) agentBalanceCheckIdx = 0
}

// Checks if need to re-register agent based on tasks getting missed
export const reRegisterAgent = async () => {
  if (!config.AGENT_AUTO_RE_REGISTER) process.exit(1)
  await agent.reRegister()
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

    // TODO: At this point we could check if we need to re-register the agent if enough remaining balance, and status went from active to pending or none.
    // NOTE: For now, stopping the process if no agent settings.
    if (!agentSettings.status) process.exit(1)
  }

  // Use agentSettings to check if the maximum missed slots have happened, stop and notify!
  let last_missed_slot = agentSettings.last_missed_slot;
  if (last_missed_slot !== 0) {
    if (last_missed_slot > (parseInt(taskRes[1]) + (croncatSettings.agents_eject_threshold * croncatSettings.slot_granularity))) {
      const ejectMsg = 'Agent has been ejected! Too many slots missed!'
      console.log(`${chalk.red(ejectMsg)}`)
      await util.notifySlack(`*${ejectMsg}*`)
      // TODO: Assess if re-register
      process.exit(1);
    }
  }

  return true
}

// TODO: Is this all i need to do? kinda seemed too easy... ROFL
export async function run() {
  await checkStatus()
  await pingAgentBalance()
  // Wait, then loop again.
  setTimeout(() => { run() }, config.WAIT_INTERVAL_MS)
}

// Initialize the agent & all configs, returns TRUE if agent is active
export async function bootstrap() {
  await connect()
  const agentId = config.AGENT_ACCOUNT_ID

  // 1. Check for local signing keys, if none - generate new and halt until funded
  agentAccount = `${await Near.getAccountCredentials(agentId)}`

  // 2. Check for balance, if enough to execute txns, start main tasks
  await checkAgentBalance(agentId)

  // 3. Check if agent is registered, if not register immediately before proceeding
  try {
    agentSettings = await getAgent(agentId)
    if (!agentSettings) {
      log(`No Agent: ${chalk.red('Please register')}`)
      process.exit(0);
    }
    log(`Registered Agent: ${chalk.white(agentId)}`)
    croncatSettings = await getCroncatInfo()
    if (!croncatSettings) {
      log(`No Croncat Deployed At this Network`)
      process.exit(0);
    }
  } catch (e) {
    if (config.AGENT_AUTO_RE_REGISTER) {
      log(`No Agent: ${chalk.gray('Attempting to register...')}`)
      await registerAgent(agentId)
    } else log(`No Agent: ${chalk.gray('Please register')}`)
  }

  return agentSettings ? true : false
}