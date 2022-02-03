require('dotenv').config()
import { utils } from 'near-api-js'

export const RPC_MAINNET = process.env.RPC_MAINNET_PROVIDERS ? process.env.RPC_MAINNET_PROVIDERS.split(',') : ['https://rpc.mainnet.near.org']
export const RPC_TESTNET = process.env.RPC_TESTNET_PROVIDERS ? process.env.RPC_TESTNET_PROVIDERS.split(',') : ['https://rpc.testnet.near.org']
export const RPC_GUILDNET = process.env.RPC_GUILDNET_PROVIDERS ? process.env.RPC_GUILDNET_PROVIDERS.split(',') : ['https://rpc.openshards.io']
export const RPC_BETANET = process.env.RPC_BETANET_PROVIDERS ? process.env.RPC_BETANET_PROVIDERS.split(',') : ['https://rpc.betanet.near.org']
export const RPC_API_KEY = process.env.RPC_API_KEY ? process.env.RPC_API_KEY : null

export const rpcs = {
  mainnet: RPC_MAINNET,
  testnet: RPC_TESTNET,
  guildnet: RPC_GUILDNET,
  betanet: RPC_BETANET,
}

export const NODE_ENV = process.env.NODE_ENV || 'development'
export const NEAR_ENV = process.env.NEAR_ENV || 'testnet'
export const LOG_LEVEL = process.env.LOG_LEVEL || 'info'
export const BETA_FEATURES = process.env.BETA_FEATURES === 'true' ? true : false
export const WAIT_INTERVAL_MS = process.env.WAIT_INTERVAL_MS ? parseInt(`${process.env.WAIT_INTERVAL_MS}`) : 30000
export const AGENT_ACCOUNT_ID = process.env.AGENT_ACCOUNT_ID || 'croncat-agent'
export const AGENT_MIN_TASK_BALANCE = utils.format.parseNearAmount(`${process.env.AGENT_MIN_TASK_BALANCE || '1'}`) // Default: 1_000_000_000_000_000_000_000_000 (1 NEAR)
export const AGENT_AUTO_REFILL = process.env.AGENT_AUTO_REFILL === 'true' ? true : false
export const AGENT_AUTO_RE_REGISTER = process.env.AGENT_AUTO_RE_REGISTER === 'true' ? true : false
export const BASE_GAS_FEE = 300000000000000
export const BASE_ATTACHED_PAYMENT = 0
export const BASE_REGISTER_AGENT_FEE = '4840000000000000000000'

const headers = {}
if (RPC_API_KEY) headers['x-api-key'] = RPC_API_KEY

// allows configuration with defaults
const getRpcByNetworkId = id => {
  return rpcs[id] && rpcs[id].length > 1 ? rpcs[id][0] : rpcs[id]
}

function getConfigByType(networkId, config) {
  return {
    networkId,
    headers,
    nodeUrl: getRpcByNetworkId(networkId),
    explorerUrl: `https://explorer.${networkId === 'mainnet' ? '' : networkId + '.'}near.org`,
    walletUrl: `https://wallet.${networkId === 'mainnet' ? '' : networkId + '.'}near.org`,
    helperUrl: `https://helper.${networkId}.near.org`,
    ...config,
  }
}

export const getConfig = (env, options = {}) => {
  switch (env) {
    case 'production':
    case 'mainnet':
      return getConfigByType('mainnet', options)
    case 'development':
    case 'testnet':
      return getConfigByType('testnet', options)
    case 'betanet':
      return getConfigByType('betanet', options)
    case 'guildnet':
      return getConfigByType('guildnet', options)
    case 'local':
      return {
        ...options,
        networkId: 'local',
        nodeUrl: 'http://localhost:3030',
        keyPath: `${process.env.HOME}/.near/validator_key.json`,
        walletUrl: 'http://localhost:4000/wallet',
      }
    default:
      throw Error(`Unconfigured environment '${env}'. Can be configured in src/configuration.js.`)
  }
}

export default getConfig