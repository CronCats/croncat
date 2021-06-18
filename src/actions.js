require('dotenv').config()
const contractAbi = require('../src/contract_abi.json')
import { utils } from 'near-api-js'
import Big from 'big.js'
import NearProvider from './near'
import chalk from 'chalk'

const log = console.log
export const env = process.env.NODE_ENV || 'development'
export const WAIT_INTERVAL_MS = process.env.WAIT_INTERVAL_MS || 500
export const AGENT_ACCOUNT_ID = process.env.AGENT_ACCOUNT_ID || 'croncat-agent'
export const BASE_GAS_FEE = 300000000000000
export const BASE_ATTACHED_PAYMENT = 0

function removeUneededArgs(obj) {
  const allowed = ['agent_account_id', 'payable_account_id', 'account', 'offset']
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

export async function connect() {
  await Near.getNearConnection()
}

export async function getCronManager(nearInstance) {
  if (cronManager) return cronManager
  const _n = nearInstance || Near
  const abi = contractAbi.abis.manager
  const contractId = contractAbi[env].manager
  cronManager = await _n.getContractInstance(contractId, abi)
  return cronManager
}

export async function registerAgent(agentId) {
  const manager = await getCronManager()

  // NOTE: Optional "payable_account_id" here
  try {
    await manager.register_agent({ agent_account_id: agentId || AGENT_ACCOUNT_ID }, BASE_GAS_FEE, BASE_ATTACHED_PAYMENT)
    log(`Registered Agent: ${chalk.white(AGENT_ACCOUNT_ID)}`)
  } catch (e) {
    if(e.type === 'KeyNotFound') {
      log(`${chalk.red('Agent Registration Failed:')} ${chalk.bold.red(`Please login to your account '${AGENT_ACCOUNT_ID}' and try again.`)}`)
    } else {
      log(`${chalk.red('Agent Registration Failed:')} ${chalk.bold.red('Please remove your credentials and try again.')}`)
    }
    process.exit(1)
  }
}

export async function getAgent(agentId) {
  const manager = await getCronManager()
  try {
    const res = manager.get_agent({ account: agentId || agentAccount })
    console.log('getAgent', res, agentId || agentAccount);
    return res
  } catch (ge) {
    console.log(ge);
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

export async function runAgentTick() {
  const manager = await getCronManager()
  let tasks = []

  // 1. Check for tasks
  tasks = (await manager.get_tasks()).filter(v => !!v)
  log(`${chalk.gray(new Date().toISOString())} Current Tasks: ${chalk.blueBright(tasks.length)}`)

  // 2. Sign task and submit to chain
  if (tasks && tasks.length > 0) {
    try {
      const res = await manager.proxy_call({}, BASE_GAS_FEE, BASE_ATTACHED_PAYMENT)
      console.log('runAgentTick res', res);
    } catch (e) {
      console.log(e)
    }
  }

  // Wait, then loop again.
  setTimeout(runAgentTick, WAIT_INTERVAL_MS)
}

export async function agentFunction(method, args, isView) {
  const _n = new NearProvider(args)
  await _n.getNearConnection()
  agentAccount = agentAccount ? agentAccount : `${await _n.getAccountCredentials(args.accountId)}`
  const manager = await getCronManager(_n)
  const params = method === 'get_agent' ? { account: agentAccount } : removeUneededArgs(args)
  let res

  try {
    res = isView
      ? await manager[method](params)
      : await manager[method](params, BASE_GAS_FEE, BASE_ATTACHED_PAYMENT)
  } catch (e) {
    if (e && e.panic_msg) {
      log('\n')
      log('\t' + chalk.red(e.panic_msg.split(',')[0].replace('panicked at ', '').replace(/\'/g, '')))
      log('\n')
    }
  }

  if (!res && !isView) log('\n\t' + chalk.green(`${method} Success!`) + '\n')
  if (!res && isView) log(chalk.green(`No response data`))

  if (isView && res) {
    try {
      const payload = JSON.parse(res)
      log('\n')
      Object.keys(payload).forEach(k => {
        log(`${chalk.bold.white(k.replace(/\_/g, ' '))}: ${chalk.white(payload[k])}`)
      })
      log('\n')
    } catch (ee) {
      log(`${chalk.bold.white(method.replace(/\_/g, ' '))}: ${chalk.white(res)}`)
    }
  }
}

export async function bootstrapAgent(agentId) {
  await connect()

  // 1. Check for local signing keys, if none - generate new and halt until funded
  agentAccount = `${await Near.getAccountCredentials(agentId || AGENT_ACCOUNT_ID)}`

  // 2. Check for balance, if enough to execute txns, start main tasks
  await checkAgentBalance(agentId)

  // 3. Check if agent is registered, if not register immediately before proceeding
  try {
    await getAgent(agentId)
    log(`Verified Agent: ${chalk.white(agentId || AGENT_ACCOUNT_ID)}`)
  } catch (e) {
    log(`No Agent: ${chalk.gray('trying to register...')}`)
    await registerAgent(agentId)
  }
}