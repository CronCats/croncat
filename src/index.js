require('dotenv').config()
const contractAbi = require('../src/contract_abi.json')
import NearProvider from './near'

const env = process.env.NODE_ENV || 'development'
const WAIT_INTERVAL_MS = process.env.WAIT_INTERVAL_MS || 500
const AGENT_ACCOUNT_ID = process.env.AGENT_ACCOUNT_ID || 'crond-agent'
const BASE_GAS_FEE = 300000000000000
const BASE_ATTACHED_PAYMENT = 0

const Near = new NearProvider({
  networkId: env === 'production' ? 'mainnet' : 'testnet',
  accountId: AGENT_ACCOUNT_ID,
})
let cronManager = null
let agentAccount = null

async function getCronManager() {
  if (cronManager) return cronManager
  const abi = contractAbi.abis.manager
  const contractId = contractAbi[env].manager
  cronManager = await Near.getContractInstance(contractId, abi)
  return cronManager
}

async function registerAgent() {
  const manager = await getCronManager()

  // NOTE: Optional "payable_account_id" here
  const res = await manager.register_agent({}, BASE_GAS_FEE, BASE_ATTACHED_PAYMENT)
  console.log('registerAgent res', res);
}

async function getAgent() {
  const manager = await getCronManager()
  return manager.get_agent({ pk: agentAccount })
}

async function runAgentTick() {
  const manager = await getCronManager()

  // 1. Check for tasks
  const tasks = await manager.get_tasks()
  console.log('tasks', tasks);

  // 2. Sign tasks and submit to chain
  const res = await manager.proxy_call({}, BASE_GAS_FEE, BASE_ATTACHED_PAYMENT)
  console.log('runAgentTick res', res);

  // Wait, then loop again.
  setTimeout(runAgentTick, WAIT_INTERVAL_MS)
}

// Cron Agent Task Loop
(async () => {
  await Near.getNearConnection()

  // 1. Check for local signing keys, if none - generate new and halt until funded
  agentAccount = await Near.getAccountCredentials(AGENT_ACCOUNT_ID)

  // 2. Check for balance, if enough to execute txns, start main tasks
  const balance = await Near.getAccountBalance()
  console.log('balance', balance);

  // 3. Check if agent is registered, if not register immediately before proceeding
  try {
    const agent = await getAgent()
    console.log('agent', agent);
  } catch (error) {
    await registerAgent()
  }

  // MAIN AGENT LOOP
  runAgentTick()
})()