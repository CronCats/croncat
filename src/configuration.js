require('dotenv').config()

export const RPC_MAINNET = process.env.RPC_MAINNET_PROVIDERS ? process.env.RPC_MAINNET_PROVIDERS.split(',') : ['https://rpc.mainnet.near.org']
export const RPC_TESTNET = process.env.RPC_TESTNET_PROVIDERS ? process.env.RPC_TESTNET_PROVIDERS.split(',') : ['https://rpc.testnet.near.org']
export const RPC_GUILDNET = process.env.RPC_GUILDNET_PROVIDERS ? process.env.RPC_GUILDNET_PROVIDERS.split(',') : ['https://rpc.openshards.io']
export const RPC_BETANET = process.env.RPC_BETANET_PROVIDERS ? process.env.RPC_BETANET_PROVIDERS.split(',') : ['https://rpc.betanet.near.org']
export const RPC_API_KEY = process.env.RPC_API_KEY ? process.env.RPC_API_KEY : null

const rpcs = {
  mainnet: RPC_MAINNET,
  testnet: RPC_TESTNET,
  guildnet: RPC_GUILDNET,
  betanet: RPC_BETANET,
}

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

export default function getConfig(env, options = {}) {
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