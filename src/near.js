import "core-js/stable"
import "regenerator-runtime/runtime"
require('dotenv').config()
import { connect, KeyPair, keyStores, Contract, utils, WalletConnection, WalletAccount } from 'near-api-js'
// import fs from 'fs'
import path from 'path'
import { homedir } from 'os'
import * as config from './configuration'

const CREDENTIALS_DIR = '.near-credentials'
const credentialsBasePath = path.join(homedir(), CREDENTIALS_DIR)

class NearProvider {

  constructor(options = {}) {
    this.config = config.getConfig(options.networkId || process.env.NEAR_ENV || 'testnet')
    this.credentials = null
    this.client = null
    this.accountId = null

    return this
  }

  async getAccountCredentials(accountId) {
    if (!accountId) return
    const keyStore = new keyStores.UnencryptedFileSystemKeyStore(credentialsBasePath)

    const existingKey = await keyStore.getKey(this.config.networkId, accountId)
    if (existingKey) {
      // console.log(`AGENT: "${accountId}", Public Key ${existingKey.publicKey}`)
      this.accountId = accountId
      return accountId
      // return existingKey.publicKey
    }

    const keyPair = KeyPair.fromRandom('ed25519')
    const publicKey = keyPair.publicKey.toString()
    const id = accountId || utils.PublicKey.fromString(publicKey).data.hexSlice()
    this.accountId = id
    await keyStore.setKey(this.config.networkId, id, keyPair)
    console.log(`NEW AGENT CREATED: "${id}", Public Key ${publicKey}\n Requires funds to start processing tasks.`)
    return this.accountId
    // return publicKey
  }

  async getNearConnection(options = {}) {
    if (this.client) return this.client
    const keyStore = new keyStores.UnencryptedFileSystemKeyStore(credentialsBasePath)
    let nodeUrl = options.nodeUrl
    const config = options.networkId ? config.getConfig(options.networkId) : this.config
    if (nodeUrl && options.networkId !== config.networkId) config.nodeUrl = nodeUrl
    try {
      this.client = await connect(Object.assign({ deps: { keyStore } }, config))
    } catch (e) {
      throw 'NEAR Connection Failed'
    }
    return this.client
  }

  async getAccountBalance() {
    const account = await this.loadAccount()
    if (!account) return 0
    const balances = await account.getAccountBalance()
    return balances && balances.available ? balances.available : 0
  }

  async loadAccount() {
    if (!this.client) return
    const user = await this.client.account(this.accountId)
    return user
  }

  async getContractInstance(contract_id, abiMethods) {
    const account = await this.loadAccount()
    const abi = {
      changeMethods: [],
      viewMethods: [],
      ...abiMethods,
    }

    // Sender is the account ID to initialize transactions.
    return new Contract(
      account,
      contract_id,
      { ...abi, sender: account }
    )
  }
}

export default NearProvider