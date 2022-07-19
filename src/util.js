import * as config from './configuration'
const contractAbi = require('./contract_abi.json')
import axios from 'axios'
import NearProvider from './near'
import chalk from 'chalk'
import slack from './slack'

export function dbug() {
  if (config.LOG_LEVEL === 'debug') console.log(...arguments)
}

const slackToken = config.SLACK_TOKEN || null
const slackChannel = config.SLACK_CHANNEL || 'general'
const slackProvider = new slack({ slackToken })
export const notifySlack = text => {
  try {
    if (slackToken) return slackProvider.send({
      slackChannel,
      text
    })
  } catch (e) {
    util.dbug('notifySlack', e);
  }
}

export const pingHeartbeat = async () => {
  if (config.HEARTBEAT && config.HEARTBEAT_URL) {
    try {
      await axios.get(config.HEARTBEAT_URL)
    } catch (e) {
      util.dbug('pingHeartbeat', e);
    }
  }
  return Promise.resolve()
}

export const removeUnneededArgs = obj => {
  const allowed = ['agent_account_id', 'payable_account_id', 'account', 'offset', 'accountId', 'account_id', 'payableAccountId']
  const fin = {}

  Object.keys(obj).forEach(k => {
    if (allowed.includes(k)) fin[k] = obj[k]
  })

  return fin
}

export const parseResponse = data => {
  return JSON.parse(Buffer.from(data).toString())
}

// "btoa" should be read as "binary to ASCII"
// btoa converts binary to Base64-encoded ASCII string
export const btoa = (text) => {
  return Buffer.from(text, 'utf8').toString('base64')
}

// "atob" should be read as "ASCII to binary"
// atob converts Base64-encoded ASCII string to binary
export const atob = (base64) => {
  return Buffer.from(base64, 'base64').toString('utf8')
}

// TODO: Multiple based on RPC providers
export const Near = new NearProvider({
  networkId: config.NODE_ENV === 'production' ? 'mainnet' : config.NODE_ENV || 'testnet',
  accountId: config.AGENT_ACCOUNT_ID,
})

export const queryRpc = async (account_id, method_name, args, options = {}, args_base64) => {
  // load contract based on abis & type
  let res

  try {
    // TODO: Test this, setup using connection pool
    res = await Near.client.connection.provider.query({
      request_type: 'call_function',
      finality: 'final',
      account_id,
      method_name,
      ...options,
      args_base64: args_base64 || btoa(JSON.stringify(args || {}))
    })
  } catch (e) {
    util.dbug('queryRpc', e)
  }

  return options && typeof options.request_type !== 'undefined' ? res : parseResponse(res.result)
}


let cronManager = null

export async function connect(options) {
  try {
    await Near.getNearConnection(options)
  } catch (e) {
    log(`${chalk.red('NEAR Connection Failed')}`)
    util.dbug('near connect', e);
    // TODO: Retry with diff Provider before hard exit
    process.exit(1)
  }
}

export async function getCronManager(accountId) {
  if (cronManager) return cronManager
  await connect()
  const _n = Near
  const abi = contractAbi.abis.manager
  const contractId = contractAbi[config.NEAR_ENV].manager
  if (accountId) _n.accountId = accountId
  cronManager = await _n.getContractInstance(contractId, abi)
  return cronManager
}

export async function getCroncatInfo() {
  const manager = await getCronManager()
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
  } catch (e) {
    util.dbug('getCroncatInfo', e);
  }
}
