import { connect, KeyPair, keyStores, utils } from 'near-api-js'
import fs from 'fs'
import path from 'path'
import { homedir } from 'os'
import getConfig from './config'

const CREDENTIALS_DIR = '.near-credentials'
const credentialsPath = path.join(homedir(), CREDENTIALS_DIR)

class NearProvider {

  constructor(config = {}) {
    this.config = getConfig(config.networkId || process.env.NEAR_ENV || 'testnet')
    this.credentials = getAccountCredentials(config.accountId)
    this.client = this.getNearConnection()
  }

  async getAccountCredentials(accountId) {
    const keyStore = new keyStores.UnencryptedFileSystemKeyStore(credentialsPath)

    const existingKey = await keyStore.getKey(this.config.networkId, accountId)
    if (existingKey) {
      console.log(`Key pair with ${existingKey.publicKey} public key for an account "${accountId}"`)
      return existingKey.publicKey
    }

    const keyPair = KeyPair.fromRandom('ed25519')
    const publicKey = keyPair.publicKey.toString()
    const id = accountId || implicitAccountId(publicKey)
    await keyStore.setKey(this.config.networkId, id, keyPair)
    console.log(`Key pair with ${publicKey} public key for an account "${id}"`)
    return publicKey
  }

  async getNearConnection() {
    if (this.client) return this.client
    const keyStore = new keyStores.UnencryptedFileSystemKeyStore(credentialsPath)
    this.client = await connect(Object.assign({ deps: { keyStore } }, this.config))
    return this.client
  }

  async getAccountBalance() {
    const account = await this.client.account(this.config.accountId)
    return account.getAccountBalance()
  }
}

export default NearProvider