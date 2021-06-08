import "core-js/stable"
import "regenerator-runtime/runtime"
import { connect, KeyPair, keyStores, Contract, WalletConnection, WalletAccount } from 'near-api-js'
// import fs from 'fs'
import path from 'path'
import { homedir } from 'os'
import getConfig from './configuration'

const CREDENTIALS_DIR = '.near-credentials'
const credentialsBasePath = path.join(homedir(), CREDENTIALS_DIR)

class NearProvider {

  constructor(config = {}) {
    this.config = getConfig(config.networkId || 'testnet')
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
      return existingKey.publicKey
    }

    const keyPair = KeyPair.fromRandom('ed25519')
    const publicKey = keyPair.publicKey.toString()
    const id = accountId || implicitAccountId(publicKey)
    this.accountId = id
    await keyStore.setKey(this.config.networkId, id, keyPair)
    console.log(`NEW AGENT CREATED: "${id}", Public Key ${publicKey}\n Requires funds to start processing tasks.`)
    return publicKey
  }

  async getNearConnection() {
    if (this.client) return this.client
    const keyStore = new keyStores.UnencryptedFileSystemKeyStore(credentialsBasePath)
    this.client = await connect(Object.assign({ deps: { keyStore } }, this.config))
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
      { ...abi, sender: account.accountId }
    )
  }
}

export default NearProvider