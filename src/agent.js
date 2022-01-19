import * as config from './configuration'
import { utils } from 'near-api-js'
import Big from 'big.js'
import chalk from 'chalk'

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

// Initialize the agent & all configs, returns TRUE if agent is active
export async function bootstrap(agentId, options) {
  await connect(options)

  // 1. Check for local signing keys, if none - generate new and halt until funded
  agentAccount = `${await Near.getAccountCredentials(agentId || config.AGENT_ACCOUNT_ID)}`

  // 2. Check for balance, if enough to execute txns, start main tasks
  await checkAgentBalance(agentId)

  // 3. Check if agent is registered, if not register immediately before proceeding
  try {
    agentSettings = await getAgent(agentId)
    if (!agentSettings) {
      log(`No Agent: ${chalk.red('Please register')}`)
      process.exit(0);
    }
    log(`Registered Agent: ${chalk.white(agentId || AGENT_ACCOUNT_ID)}`)
    croncatSettings = await getCroncatInfo(options)
    if (!croncatSettings) {
      log(`No Croncat Deployed At this Network`)
      process.exit(0);
    }
  } catch (e) {
    if (AGENT_AUTO_RE_REGISTER) {
      log(`No Agent: ${chalk.gray('Attempting to register...')}`)
      await registerAgent(agentId)
    } else log(`No Agent: ${chalk.gray('Please register')}`)
  }

  return agentSettings ? true : false
}